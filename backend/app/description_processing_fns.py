import os
from google import genai
import time
from typing import Dict, List, Any, Tuple
import logging

#modules imports
from app import gemini_fns
from app import search_fns
from app.functional_models import ProductInfo, SanityCheckResult, ProductCategory
from app.database_models import ProductRow, SourceFileType, LocalUploadFile

logger = logging.getLogger("api")

def parse_price(price: str|float) -> float:
    if isinstance(price, str):
        return float(price.replace('$', '').strip())
    return float(price)

def extract_product_details_from_description(
        item_description:str,
        description_file:LocalUploadFile,
        model_map:Dict,
        prompt_templates:Dict[str,str],
        base_added_context:str,
        client:genai.Client,
        search_api_key:str,
        cx:str,
        search_engine:str='combined',
    ) -> Tuple[ProductRow,str]:

    product_row = ProductRow(
        uploaded_file_doc_id=description_file.doc_id,
        category=ProductCategory.OTHER,
        name='temp',
        replacement_price=0.0,
        actual_cash_value=0.0, 
        item_url=None,
        source_file_type=SourceFileType.ITEM_DESCRIPTION,
        source_file_link='temp',
        item_notes=description_file.file_added_context,
        quantity=description_file.quantity,
        room=description_file.room,
    )
    try:
        logger.info(f"Reviewing described item | item={item_description}")
        start = time.time()

        #format the added context per item
        if description_file.file_added_context and len(description_file.file_added_context)>0:
            added_context = base_added_context + f"\nThe following notes were added for this item. Relevant information in these notes should be prioritized over other information related to the product:\n{description_file.file_added_context}"
        else:
            added_context = base_added_context

        #get the general query information for the item
        prod_id_prompt = prompt_templates['audio_product_id_prompt']
        product_id_response = gemini_fns.product_identification_request(item_description, None, model_map['product_id_model'], client, prod_id_prompt , added_context=added_context)
        logger.info(f"Product identification complete | item={item_description} description={product_id_response.description}")

        #search for the product
        num_search_results = 10
        if search_engine == 'ddgs':
            query_urls, search_results_str = search_fns.search_for_product_pages_ddg(product_id_response, num_results=num_search_results)
        elif search_engine == 'google':
            query_urls, search_results_str = search_fns.search_for_product_pages(product_id_response, search_api_key, cx, num_results=num_search_results)
        elif search_engine == 'combined':
            query_urls, search_results_str = search_fns.search_for_product_pages_combined(product_id_response, search_api_key, cx, num_results=num_search_results)

        #analyze the search results
        #analyze the search results
        num_best_urls = 5
        best_query_urls = gemini_fns.url_analysis_request(
                                                            query_urls,
                                                            search_results_str,
                                                            None,
                                                            product_id_response.description,
                                                            model_map['url_analysis_model'],
                                                            client,
                                                            prompt_templates['url_analysis_prompt'],
                                                            num_results=num_best_urls,
                                                            added_context=added_context
                                                        )
        if len(best_query_urls) > 0:
            logger.info(f"Web search and URL analysis complete | item={item_description} urls_found={len(best_query_urls)}")
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
                logger.info(f"Product price and source analysis complete | item={item_description}, url: {query_url}")
            else:
                logger.info(f"Product page not valid | item={item_description}, url: {query_url}")
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
            
            logger.info(f"Sanity check | item={item_description} result={sanity_check.result} reason={sanity_check.failure_reason}")
            if sanity_check.result == SanityCheckResult.VALID:
                #parse the info
                product_found = True
                product_row.item_url = query_url
                product_row.name = product_detail.name
                product_row.replacement_price = product_detail.price
                product_row.category = product_detail.category

                break
            
        if not product_found:
            raise ValueError('No Valid Results Found')
        
        elapsed = time.time() - start
        logger.info(f"Described item analysis complete | item={item_description} product_name={product_row.name} price={product_row.replacement_price} category={product_row.category} url={product_row.item_url} elapsed_seconds={round(elapsed, 2)}")

        return product_row, 'success'

    except Exception as E:
        logger.error(f"Described item analysis failed | item={item_description} error={type(E).__name__}: {E}", exc_info=True)
        product_row.name = item_description
        product_row.category = ProductCategory.OTHER
        product_row.replacement_price = 0.0
        product_row.item_url = None
        product_row.item_notes = 'Product Analysis Failed. Please add more information and retry'
        return product_row, str(E)