import os
from google import genai
from google.genai.types import HttpOptions
import yaml
from pathlib import Path
import time
from typing import Optional, Tuple, List, Dict, Any
from dotenv import load_dotenv
from functools import partial
from multiprocessing import Pool
import logging

from app import gemini_fns
from app import image_processing_fns
from app import description_processing_fns
from app.datastore_manager import DatastoreManager
from app.database_models import ProcessedFiles, ProductRow, ProcessingFileError, LocalUploadFile, SourceFileType, UserInfo

logger = logging.getLogger("api")

load_dotenv()
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
SEARCH_API_KEY = None #os.getenv('SEARCH_API_KEY')

PROMPT_FILE = "prompts.yaml"
MODEL_MAP_FILE = "gemini_models.yaml"
RETRY_FAILED_IMS = True
CX = os.getenv('CX') #custom search engine id
GEMINI_TIMEOUT_S = 2*60*1000 #2min timeout
USE_MULTIPROCESS = True
NUM_PROCESSES = 4
MAX_RETRIES = 1
MAX_ITER = 100 #maximum number of items/images processed
IMAGE_SUFFIXES = ['.jpg', '.JPG', '.png', '.PNG', '.HEIC', '.heic', '.pdf', '.PDF']
PDF_SUFFIXES = ['.pdf', '.PDF']
USER_SITE_URL = 'http://localhost:8257/local_files/'
SEARCH_ENGINE = os.getenv('SEARCH_ENGINE')

#startup and config
_client: Optional[genai.Client] = None

def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set. Configure via frontend.")
        _client = genai.Client(
            http_options=HttpOptions(timeout=GEMINI_TIMEOUT_S),
            api_key=api_key,
        )
        logger.info("Gemini client initialized")
    return _client

def reset_client() -> None:
    """Call after GEMINI_API_KEY updated at runtime."""
    global _client
    _client = None

def get_or_process_added_context(claim_id:str, model_map:dict, client:genai.Client, prompt_templates:Dict[str,str], db:DatastoreManager):
    ac = db.get_added_context(claim_id)
    if ac is None:
        base_added_context = prompt_templates['default_added_context']
    else:
        if len(ac.raw_text.strip()) == 0:
            base_added_context = prompt_templates['default_added_context']
        else:
            if ac.processed_text is None:
                base_added_context = gemini_fns.added_context_format_request(ac.raw_text, model_map['added_context_format_model'], client, prompt_templates['process_added_context_prompt'])
                ac.processed_text = base_added_context
                db.set_added_context(claim_id, ac)
            else:
                base_added_context = ac.processed_text
    return base_added_context

def _update_failed_files(base_name:str, message:str, failed_files:Dict[str,ProcessingFileError]):
    if base_name in failed_files:
        error_data = failed_files[base_name]
        error_data.retry_count = error_data.retry_count + 1
    else:
        error_data = ProcessingFileError(exception='', retry_count=0)
    error_data.exception = message
    failed_files[base_name] = error_data
    return failed_files

def img_process_worker(
        img_file:LocalUploadFile,
        model_map:Dict,
        prompt_templates:Dict,
        failed_im_list:Dict,
        added_context:str|None,
    ) -> Tuple[LocalUploadFile, ProductRow, str]:
    """
    Worker function for multiprocessing pool.
    Returns tuple of (img_file, prod_detail_row, message) for handling in main process.
    """
    
    client = get_client()
    # Data processing for this image
    use_fallback_id_request = os.path.basename(img_file.local_filename) in failed_im_list
    prod_detail_row, message = image_processing_fns.extract_product_details_from_image(
        img_file, 
        model_map,
        prompt_templates, 
        added_context, 
        client, 
        search_api_key=SEARCH_API_KEY,
        cx=CX,
        user_site_url=USER_SITE_URL,
        use_fallback_id_request=use_fallback_id_request,
        search_engine=SEARCH_ENGINE
    )
    
    return (img_file, prod_detail_row, message)


def run_image_pipeline(claim_id:str, image_files:List[LocalUploadFile], db:DatastoreManager):
    #get the prompt template from file
    with open(PROMPT_FILE, 'r') as f:
        prompt_templates = yaml.safe_load(f)
    
    #get the models to call
    with open(MODEL_MAP_FILE, 'r') as f:
        model_map = yaml.safe_load(f)

    #get/format the added context
    client = get_client()
    base_added_context = get_or_process_added_context(claim_id, model_map, client, prompt_templates, db)

    total_run_count = 0
    analysis_start = time.time()
    processed_files = db.get_processed_files(claim_id)
    total_items = 0
    total_value = 0
    claim_id = image_files[0].claim_or_inv_id
    while total_run_count < MAX_ITER:
        
        if processed_files is None:
            failed_files = {}
            failed_files_set = set()
            success_files = set()
        else:
            success_files = set(processed_files.success) #set for lookup efficiency
            failed_files = processed_files.error
            failed_files_set = set(failed_files.keys()) #set for lookup efficiency

        #remove already processed ims and files that don't exist anymore
        image_files = [file for file in image_files if os.path.basename(file.local_filename) not in success_files]
        if not RETRY_FAILED_IMS:
            image_files = [file for file in image_files if os.path.basename(file.local_filename) not in failed_files_set]
        image_files = [file for file in image_files if Path(file.local_filename).exists()]
        if len(image_files) == 0:
            break

        if USE_MULTIPROCESS and NUM_PROCESSES >= 1:
            # Create partial function with fixed arguments
            worker_fn = partial(
                img_process_worker,
                prompt_templates=prompt_templates,
                failed_im_list=failed_files_set,
                added_context=base_added_context,
                model_map=model_map,
            )
            
            #process the images simultaneously
            with Pool(processes=NUM_PROCESSES) as pool:
                for img_file, prod_detail_row, message in pool.imap_unordered(worker_fn, image_files):

                    #write results to file
                    processed_files = image_processing_fns.handle_result(
                        img_file,
                        prod_detail_row,
                        message,
                        success_files,
                        failed_files,
                        claim_id,
                        db,
                        max_retries=MAX_RETRIES
                    )
                    time.sleep(.25)
                    total_run_count += 1
                    if message == 'success':
                        total_items += 1
                        total_value += prod_detail_row.replacement_price
                    
        else:
            #single process
            for img_file in image_files:
                #data processing for this image
                use_fallback_id_request = os.path.basename(img_file.local_filename) in failed_files_set
                prod_detail_row, message = image_processing_fns.extract_product_details_from_image(
                    img_file, 
                    model_map,
                    prompt_templates, 
                    base_added_context, 
                    client, 
                    search_api_key=SEARCH_API_KEY,
                    cx=CX,
                    user_site_url=USER_SITE_URL,
                    use_fallback_id_request=use_fallback_id_request,
                    search_engine=SEARCH_ENGINE
                )

                #write results to file
                processed_files = image_processing_fns.handle_result(
                    img_file,
                    prod_detail_row,
                    message,
                    success_files,
                    failed_files,
                    claim_id,
                    db,
                    max_retries=MAX_RETRIES
                )
                total_run_count += 1
                if message == 'success':
                    total_items += 1
                    total_value += prod_detail_row.replacement_price * prod_detail_row.quantity
                    
    #update the files
    db.set_processed_files(claim_id, processed_files)

    #update the database for number of items and total value
    claim_info_data = db.get_claim(claim_id)
    claim_info_data.total_value = claim_info_data.total_value + total_value
    db.update_claim(claim_id, claim_info_data)

    #stop the timer
    elapsed = time.time() - analysis_start
    logger.info(f"Image pipeline complete | images_processed={total_run_count} elapsed_seconds={round(elapsed, 1)}")

        
def description_process_worker(item_description:str, model_map:Dict, description_file:LocalUploadFile, prompt_templates:dict, added_context:str|None) -> Tuple[str, ProductRow, str]:
    """
    Worker function for multiprocessing pool.
    Returns tuple of (img_file, prod_detail_row, message) for handling in main process.
    """
    
    # Data processing for this image
    client = get_client()
    prod_detail_row, message = description_processing_fns.extract_product_details_from_description(
        item_description, 
        description_file,
        model_map,
        prompt_templates, 
        added_context, 
        client,
        search_api_key=SEARCH_API_KEY,
        cx=CX,
        search_engine=SEARCH_ENGINE,
    )
    
    return (item_description, prod_detail_row, message)

def run_audio_pipeline(claim_id:str, audio_files:List[LocalUploadFile], db:DatastoreManager):

    #get the prompt template from file
    with open(PROMPT_FILE, 'r') as f:
        prompt_templates = yaml.safe_load(f)

    #get the models to call
    with open(MODEL_MAP_FILE, 'r') as f:
        model_map = yaml.safe_load(f)

    #get/format the added context
    client = get_client()
    base_added_context = get_or_process_added_context(claim_id, model_map, client, prompt_templates, db)

    total_run_count = 0
    analysis_start = time.time()
    item_total = 0
    total_items = 0 
    total_value = 0 
    processed_files = db.get_processed_files(claim_id)
    claim_id = audio_files[0].claim_or_inv_id
    while total_run_count <= MAX_ITER:

        #load processed files from db
        if processed_files is None:
            failed_files = {}
            failed_files_set = set()
            success_files = set()
        else:
            success_files = set(processed_files.success) #set for lookup efficiency
            failed_files = processed_files.error
            failed_files_set = set(failed_files.keys()) #set for lookup efficiency

        #remove already processed ims and files that don't exist anymore
        audio_files = [file for file in audio_files if os.path.basename(file.local_filename) not in success_files]
        if not RETRY_FAILED_IMS:
            audio_files = [file for file in audio_files if os.path.basename(file.local_filename) not in failed_files_set]
        audio_files = [file for file in audio_files if Path(file.local_filename).exists()]
        if len(audio_files) == 0:
            break

        analysis_start = time.time()
        for audio_file in audio_files:
            try: 
                base_name = os.path.basename(audio_file.local_filename)
                hosted_file_url = f'{USER_SITE_URL}claims/{claim_id}/files/{base_name}'
                try:
                    cloud_audio_file = client.files.upload(file=audio_file.local_filename)
                except genai.errors.ClientError as E:
                    cloud_audio_file = None
                    raise ValueError('Cloud File Upload Failed')

                #extract item descriptions
                audio_item_descriptions = gemini_fns.audio_item_extraction_request(
                                            cloud_audio_file,
                                            model_map['audio_item_extraction_model'],
                                            client,
                                            prompt_templates['audio_item_extraction_prompt'],
                                            added_context=base_added_context
                                        )
                item_descriptions = audio_item_descriptions.item_descriptions
                item_total = item_total + len(item_descriptions)
                logger.info(f"Audio items extracted | file={base_name} item_count={len(item_descriptions)} items={item_descriptions}")

                # Create partial function with fixed arguments
                worker_fn = partial(
                    description_process_worker,
                    description_file=audio_file,
                    prompt_templates=prompt_templates,
                    added_context=base_added_context,
                    model_map=model_map,
                )
                
                if USE_MULTIPROCESS: #process the images simultaneously
                    with Pool(processes=max(NUM_PROCESSES,1)) as pool:
                        for item_description, prod_row, message in pool.imap_unordered(worker_fn, item_descriptions):

                            #Add the audio file link
                            prod_row.uploaded_file_doc_id = audio_file.doc_id
                            prod_row.source_file_link = hosted_file_url
                            prod_row.source_file_type = SourceFileType.AUDIO

                            #add the product to the db
                            _ = db.add_item(audio_file.claim_or_inv_id, prod_row)

                            time.sleep(.25)
                            total_value = total_value + prod_row.replacement_price * prod_row.quantity
                            total_items = total_items + 1
                else:
                    for item_description in item_descriptions:
                        prod_row, message = description_processing_fns.extract_product_details_from_description(
                            item_description, 
                            audio_file,
                            model_map,
                            prompt_templates, 
                            base_added_context, 
                            client,
                            search_api_key=SEARCH_API_KEY,
                            cx=CX,
                            search_engine=SEARCH_ENGINE,
                        )

                        #Add the audio file link
                        prod_row.uploaded_file_doc_id = audio_file.doc_id
                        prod_row.source_file_link = hosted_file_url
                        prod_row.source_file_type = SourceFileType.AUDIO

                        #add the product to the db
                        db.add_item(audio_file.claim_or_inv_id, prod_row)

                        time.sleep(.25)
                        total_value = total_value + prod_row.replacement_price * prod_row.quantity
                        total_items = total_items + 1
                        
                #add the files to the logs
                success_files.add(base_name)
                logger.info(f"Audio file processed successfully | file={base_name}")

            except Exception as E:
                msg = f'{type(E).__name__}: {E}'
                failed_files = _update_failed_files(base_name, msg, failed_files)
                logger.error(f"Audio file processing failed | file={base_name} error={msg} retry_count={failed_files[base_name].retry_count}", exc_info=True)

                #give up after so many tries
                if failed_files[base_name].retry_count >= MAX_RETRIES:
                    success_files.add(base_name)
                    logger.warning(f"Audio file max retries reached, giving up | file={base_name} max_retries={MAX_RETRIES}")

            finally:
                #delete the file upon completion
                if cloud_audio_file is not None:
                    client.files.delete(name=cloud_audio_file.name)

                #update the logs
                processed_files = ProcessedFiles(success=list(success_files), error=failed_files)

                total_run_count += 1
    #update the files
    db.set_processed_files(claim_id, processed_files)

    #update the database for number of items and total value
    claim_info_data = db.get_claim(claim_id)
    claim_info_data.total_value = claim_info_data.total_value + total_value
    db.update_claim(claim_id, claim_info_data)

    #stop the timer
    elapsed = time.time() - analysis_start
    logger.info(f"Audio pipeline complete | files_processed={total_run_count} items_processed={item_total} elapsed_seconds={round(elapsed, 1)}")

def run_receipt_pipeline(
        claim_id:str,
        receipt_files:List[LocalUploadFile],
        db:DatastoreManager
    ):

    #get the prompt template from file
    with open(PROMPT_FILE, 'r') as f:
        prompt_templates = yaml.safe_load(f)

    #get the models to call
    with open(MODEL_MAP_FILE, 'r') as f:
        model_map = yaml.safe_load(f)

    client = get_client()
    total_run_count = 0
    analysis_start = time.time()
    total_items = 0
    total_value = 0
    processed_files = db.get_processed_files(claim_id)
    while total_run_count <= MAX_ITER:

        #store processed files for
        if processed_files is None:
            failed_files = {}
            failed_files_set = set()
            success_files = set()
        else:
            success_files = set(processed_files.success) #set for lookup efficiency
            failed_files = processed_files.error
            failed_files_set = set(failed_files.keys()) #set for lookup efficiency

        #remove already processed ims and files that don't exist anymore
        receipt_files = [file for file in receipt_files if os.path.basename(file.local_filename) not in success_files]
        if not RETRY_FAILED_IMS:
            receipt_files = [file for file in receipt_files if os.path.basename(file.local_filename) not in failed_files_set]
        receipt_files = [file for file in receipt_files if Path(file.local_filename).exists()]
        if len(receipt_files) == 0:
            break
        
        total_run_count +=1 
        claim_id = receipt_files[0].claim_or_inv_id
        for receipt_file in receipt_files:

            try: 
                basename = os.path.basename(receipt_file.local_filename)
                hosted_file_url = f'{USER_SITE_URL}claims/{claim_id}/files/{basename}'
                try:
                    cloud_actuals_file = client.files.upload(file=receipt_file.local_filename)
                except genai.errors.ClientError as E:
                    cloud_actuals_file = None
                    raise ValueError('Cloud File Upload Failed')

                #extract the individual line items
                prompt_template = prompt_templates['pdf_receipt_item_extraction_prompt']
                actual_items_extraction = gemini_fns.actuals_item_extraction_request(cloud_actuals_file, model_map['actuals_item_extraction_model'], client, prompt_template, added_context=None)
                logger.info(f"Receipt item extraction complete | file={basename} item_count={len(actual_items_extraction.actual_items)}")

                #loop through each item
                for actuals_item in actual_items_extraction.actual_items:
                    
                    logger.debug(f"Receipt line item | file={basename} item_name={actuals_item.name} item_price={actuals_item.price} item_category={actuals_item.category}")

                    prod_row = ProductRow(
                        uploaded_file_doc_id=receipt_file.doc_id,
                        category=actuals_item.category,
                        name=actuals_item.name,
                        replacement_price=actuals_item.price,
                        actual_cash_value=0.0, 
                        item_url=None,
                        source_file_type=SourceFileType.RECEIPT,
                        source_file_link=hosted_file_url,
                        item_notes=receipt_file.file_added_context,
                        quantity=actuals_item.quantity
                    )
                    db.add_item(receipt_file.claim_or_inv_id, prod_row)

                    #add the files to the logs
                    success_files.add(basename)
                    total_items = total_items + 1
                    total_value = total_value + actuals_item.price * actuals_item.quantity

                logger.info(f"Receipt file processed successfully | file={basename} items_extracted={len(actual_items_extraction.actual_items)}")

            except Exception as E:
                msg = f'{type(E).__name__}: {E}'
                failed_files = _update_failed_files(basename, msg, failed_files)
                logger.error(f"Receipt file processing failed | file={basename} error={msg} retry_count={failed_files[basename].retry_count}", exc_info=True)

                #give up after so many tries
                if failed_files[basename].retry_count >= MAX_RETRIES:
                    success_files.add(basename)
                    logger.warning(f"Receipt file max retries reached, giving up | file={basename} max_retries={MAX_RETRIES}")
                
            finally:
                #delete the file upon completion
                if cloud_actuals_file is not None:
                    client.files.delete(name=cloud_actuals_file.name)

                #update processed list
                processed_files = ProcessedFiles(success=list(success_files), error=failed_files)
                time.sleep(0.25)

    #update the logs
    db.set_processed_files(claim_id, processed_files)

    #update the database for number of items and total value
    claim_info_data = db.get_claim(claim_id)
    claim_info_data.total_value = claim_info_data.total_value + total_value
    db.update_claim(claim_id, claim_info_data)

    #stop the timer
    elapsed = time.time() - analysis_start
    logger.info(f"Receipt pipeline complete | files_processed={total_run_count} items_processed={total_items} elapsed_seconds={round(elapsed, 1)}")


def run_description_pipeline(claim_id:str, description_files:List[LocalUploadFile], db:DatastoreManager):

    #get the prompt template from file
    with open(PROMPT_FILE, 'r') as f:
        prompt_templates = yaml.safe_load(f)

    #get the models to call
    with open(MODEL_MAP_FILE, 'r') as f:
        model_map = yaml.safe_load(f)

    #get/format the added context
    client = get_client()
    base_added_context = get_or_process_added_context(claim_id, model_map, client, prompt_templates, db)

    #loop through the files
    total_run_count = 0
    analysis_start = time.time()
    item_total = 0
    total_items = 0 
    total_value = 0 
    processed_files = db.get_processed_files(claim_id)
    claim_id = description_files[0].claim_or_inv_id
    while total_run_count <= MAX_ITER:

        #load processed files from db
        if processed_files is None:
            failed_files = {}
            failed_files_set = set()
            success_files = set()
        else:
            success_files = set(processed_files.success) #set for lookup efficiency
            failed_files = processed_files.error
            failed_files_set = set(failed_files.keys()) #set for lookup efficiency


        #remove already processed ims and files that don't exist anymore
        description_files = [file for file in description_files if os.path.basename(file.local_filename) not in success_files]
        if not RETRY_FAILED_IMS:
            description_files = [file for file in description_files if os.path.basename(file.local_filename) not in failed_files_set]
        description_files = [file for file in description_files if Path(file.local_filename).exists()]
        if len(description_files) == 0:
            break

        analysis_start = time.time()
        for description_file in description_files:
            try: 
                
                #get the file from the bucket
                local_filename = description_file.local_filename
                base_name = os.path.basename(local_filename)
                hosted_file_url = f'{USER_SITE_URL}claims/{claim_id}/files/{base_name}'
                with open(local_filename, 'r') as f:
                    description_text = f.read()

                #extract item descriptions
                item_descriptions = gemini_fns.text_description_item_extraction(
                                            description_text,
                                            model_map['text_description_item_extraction_model'],
                                            client,
                                            prompt_templates['text_item_extraction_prompt'],
                                            added_context=base_added_context
                                        )
                item_descriptions = item_descriptions.item_descriptions
                item_total = item_total + len(item_descriptions)
                logger.info(f"Described items extracted | file={base_name} item_count={len(item_descriptions)} items={item_descriptions}")

                # Create partial function with fixed arguments
                worker_fn = partial(
                    description_process_worker,
                    description_file=description_file,
                    prompt_templates=prompt_templates,
                    added_context=base_added_context,
                    model_map=model_map,
                )
                
                if USE_MULTIPROCESS: #process the images simultaneously
                    with Pool(processes=max(NUM_PROCESSES,1)) as pool:
                        for item_description, prod_row, message in pool.imap_unordered(worker_fn, item_descriptions):

                            #Add the audio file link
                            prod_row.uploaded_file_doc_id = description_file.doc_id
                            prod_row.source_file_link = hosted_file_url
                            prod_row.source_file_type = SourceFileType.ITEM_DESCRIPTION

                            #add the product to the db
                            db.add_item(description_file.claim_or_inv_id, prod_row)

                            time.sleep(.25)
                            total_value = total_value + prod_row.replacement_price * prod_row.quantity
                            total_items = total_items + 1
                else:
                    for item_description in item_descriptions:
                        prod_row, message = description_processing_fns.extract_product_details_from_description(
                            item_description, 
                            description_file,
                            model_map,
                            prompt_templates, 
                            base_added_context, 
                            client,
                            search_api_key=SEARCH_API_KEY,
                            cx=CX,
                            search_engine=SEARCH_ENGINE,
                        )

                        #Add the audio file link
                        prod_row.uploaded_file_doc_id = description_file.doc_id
                        prod_row.source_file_link = hosted_file_url
                        prod_row.source_file_type = SourceFileType.ITEM_DESCRIPTION

                        #add the product to the db
                        db.add_item(description_file.claim_or_inv_id, prod_row)

                        time.sleep(.25)
                        total_value = total_value + prod_row.replacement_price * prod_row.quantity
                        total_items = total_items + 1
                        
                #add the files to the logs
                success_files.add(base_name)
                logger.info(f"Description file processed successfully | file={base_name}")

            except Exception as E:
                msg = f'{type(E).__name__}: {E}'
                failed_files = _update_failed_files(base_name, msg, failed_files)
                logger.error(f"Description file processing failed | file={base_name} error={msg} retry_count={failed_files[base_name].retry_count}", exc_info=True)

                #give up after so many tries
                if failed_files[base_name].retry_count >= MAX_RETRIES:
                    success_files.add(base_name)
                    logger.warning(f"Description file max retries reached, giving up | file={base_name} max_retries={MAX_RETRIES}")

            finally:
                #update the logs
                processed_files = ProcessedFiles(success=list(success_files), error=failed_files)

                total_run_count += 1
    #update the files
    db.set_processed_files(claim_id, processed_files)

    #update the database for number of items and total value
    claim_info_data = db.get_claim(claim_id)
    claim_info_data.total_value = claim_info_data.total_value + total_value
    db.update_claim(claim_id, claim_info_data)

    #stop the timer
    elapsed = time.time() - analysis_start
    logger.info(f"Description pipeline complete | files_processed={total_run_count} items_processed={item_total} elapsed_seconds={round(elapsed, 1)}")