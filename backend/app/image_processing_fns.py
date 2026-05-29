import os
import time
from google import genai
from typing import Dict, List, Any, Tuple, Set
import logging

#modules imports
from app import gemini_fns
from app import search_fns
from app.functional_models import ProductInfo, SanityCheckResult
from app.datastore_manager import DatastoreManager
from app.database_models import ProcessedFiles, ProductRow, ProcessingFileError, LocalUploadFile, SourceFileType

logger = logging.getLogger("api")

USE_DDG = True

def parse_price(price: str|float) -> float:
    if isinstance(price, str):
        return float(price.replace('$', '').strip())
    return float(price)

def _update_failed_ims(base_name:str, message:str, failed_files:Dict[str,ProcessingFileError]):
    if base_name in failed_files:
        error_data = failed_files[base_name]
        error_data.retry_count = error_data.retry_count + 1
    else:
        error_data = ProcessingFileError(exception='', retry_count=0)
    error_data.exception = message
    failed_files[base_name] = error_data
    return failed_files

def handle_result(
        img_file:LocalUploadFile,
        prod_row:ProductRow,
        message:str,
        success_files:Set,
        failed_files:Dict,
        claim:str,
        db:DatastoreManager,
        max_retries:int=3,
    ) -> ProcessedFiles:

    write_to_db = False
    basename = os.path.basename(img_file.local_filename)
    if message != 'success':
        failed_files = _update_failed_ims(basename, message, failed_files)
        logger.warning(f"Image processing failed | claim={claim} file={basename} error={message} retry_count={failed_files[basename].retry_count}")

        if failed_files[basename].retry_count >= max_retries:
            prod_row.replacement_price = 0.0
            prod_row.item_url = None
            success_files.add(basename)
            logger.warning(f"Image max retries reached, giving up | claim={claim} file={basename} max_retries={max_retries}")
            write_to_db = True

    else:
        #add to the log
        write_to_db = True
        success_files.add(basename)
        logger.info(f"Image processed successfully | claim={claim} file={basename} product_name={prod_row.name} price={prod_row.replacement_price}")

    if write_to_db:
        #add the product to the db
        db.add_item(img_file.claim_or_inv_id, prod_row)
        pass

    #update the logs
    return ProcessedFiles(success=list(success_files), error=failed_files)


def extract_product_details_from_image(
        img_file:LocalUploadFile,
        model_map:Dict,
        prompt_templates:Dict[str,str],
        base_added_context:str,
        client:genai.Client,
        search_api_key:str,
        cx:str,
        user_site_url:str,
        use_fallback_id_request:bool=False,
        search_engine:str='combined'
) -> Tuple[ProductRow,str]:
    
    product_row = ProductRow(
        uploaded_file_doc_id=img_file.doc_id,
        category='temp',
        name='temp',
        replacement_price=0.0,
        actual_cash_value=0.0, 
        item_url=None,
        source_file_type=SourceFileType.IMAGE,
        source_file_link='other',
        item_notes=img_file.file_added_context,
        room=img_file.room,
        quantity=img_file.quantity,
    )
    cloud_img = None
    try:
        base_name = os.path.basename(img_file.local_filename)
        logger.info(f"Reviewing image file | file={base_name} fallback_mode={use_fallback_id_request}")
        start = time.time()

        #format the added context per item
        if img_file.file_added_context and len(img_file.file_added_context)>0:
            added_context = base_added_context + f"\nThe following notes were added for this item. Relevant information in these notes should be prioritized over other information related to the product:\n{img_file.file_added_context}"
        else:
            added_context = base_added_context

        #get the file
        hosted_file_url = f'{user_site_url}claims/{img_file.claim_or_inv_id}/files/{base_name}'
        product_row.source_file_link = hosted_file_url
        try:
            cloud_img = client.files.upload(file=img_file.local_filename)
        except genai.errors.ClientError as E:
            cloud_img = None
            raise ValueError('Cloud File Upload Failed')

        #get the general query information for the item
        if use_fallback_id_request:
            prod_id_prompt = prompt_templates['fallback_product_id_prompt']
        else:
            prod_id_prompt = prompt_templates['product_id_prompt']
        product_id_response = gemini_fns.product_identification_request(None, cloud_img, model_map['product_id_model'], client, prod_id_prompt , added_context=added_context)
        logger.info(f"Product identification complete | file={base_name} description={product_id_response.description}")

        #search for the product
        num_search_results = 10
        if search_engine == 'ddgs':
            query_urls, search_results_str = search_fns.search_for_product_pages_ddg(product_id_response, num_results=num_search_results)
        elif search_engine == 'google':
            query_urls, search_results_str = search_fns.search_for_product_pages(product_id_response, search_api_key, cx, num_results=num_search_results)
        elif search_engine == 'combined':
            query_urls, search_results_str = search_fns.search_for_product_pages_combined(product_id_response, search_api_key, cx, num_results=num_search_results)
        #analyze the search results
        num_best_urls = 5
        best_query_urls = gemini_fns.url_analysis_request(
                                                            query_urls,
                                                            search_results_str,
                                                            cloud_img,
                                                            product_id_response.description,
                                                            model_map['url_analysis_model'],
                                                            client,
                                                            prompt_templates['url_analysis_prompt'],
                                                            num_results=num_best_urls,
                                                            added_context=added_context
                                                        )
        if len(best_query_urls) > 0:
            logger.info(f"Web search and URL analysis complete | file={base_name} urls_found={len(best_query_urls)}")
        else:
            raise ValueError('No Valid URLs Found')

        product_found = False
        for ii, query_url in enumerate(best_query_urls):
            #extract the details from the product page
            product_detail = gemini_fns.product_details_request(
                query_url,
                product_id_response.description,
                model_map['product_details_model'],
                client,
                prompt_templates['product_detail_prompt'],
                added_context=added_context
            )
            if product_detail.valid:
                logger.info(f"Product price and source analysis complete | file={base_name}, url: {query_url}")
            else:
                logger.info(f"Product page not valid | file={base_name}, url: {query_url}")
                continue
        

            #sanity check 
            sanity_check = gemini_fns.sanity_check_request(
                                    product_detail,
                                    query_url,
                                    model_map['sanity_check_model'],
                                    client,
                                    prompt_templates['sanity_check_prompt'],
                                    added_context=added_context
                            )
            
            logger.info(f"Sanity check | file={base_name} result={sanity_check.result} reason={sanity_check.failure_reason}")
            if sanity_check.result == SanityCheckResult.VALID:
                #parse the info
                product_found = True
                product_row.item_url = query_url
                product_row.name = product_detail.name
                product_row.replacement_price = product_detail.price
                product_row.category = product_detail.category
                product_row.source_file_link = hosted_file_url

                break
            
        if not product_found:
            raise ValueError('No Valid Results Found')
        
        elapsed = time.time() - start
        logger.info(f"Image item analysis complete | file={base_name} product_name={product_row.name} price={product_row.replacement_price} category={product_row.category} url={product_row.item_url} elapsed_seconds={round(elapsed, 2)}")

        return product_row, 'success'

    except Exception as E:
        product_row.replacement_price = 0.0
        product_row.item_url  = None
        logger.error(f"Image item analysis failed | file={os.path.basename(img_file.local_filename)} error={type(E).__name__}: {E}", exc_info=True)
        return product_row, f'{type(E).__name__}: {E}'
    
    finally:
        #delete the file upon completion
        if cloud_img is not None:
            client.files.delete(name=cloud_img.name)