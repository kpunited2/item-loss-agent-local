
import json
import random
from typing import Dict, List, Tuple, Optional
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GenerateContentConfigDict, GoogleSearch, UrlContext, File, Content, Part

from app.functional_models import (ProductSearchQuery, ProductList, ProductSanityCheck, ProductInfo, AudioItemExtraction,
                                    ActualsItemExtraction, URLAnalysis, URLAnalysisResult)

def product_identification_request(
        item_description:Optional[str],
        cloud_img:Optional[File],
        model_name:str,
        client:genai.Client,
        prompt_template:str,
        added_context:Optional[str]=None
    ) -> ProductSearchQuery:
    
    #format prompt
    prompt = prompt_template #no modification needed now
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')
    
    if item_description is not None:
        prompt = prompt.replace(r'{__item_description__}', item_description)
    #print(prompt)
    
    #setup, call, and format response
    if cloud_img is not None:
        contents_list = [cloud_img, prompt]
    else:
        contents_list = [prompt]
    search_tool = Tool(google_search=GoogleSearch())
    prod_definition_response = client.models.generate_content(
        model=model_name,
        contents=contents_list,
        config=GenerateContentConfig(
            max_output_tokens=10000,tools=[search_tool],
            response_mime_type="application/json",
            response_json_schema=ProductSearchQuery.model_json_schema())
    )

    result = ProductSearchQuery(**json.loads(prod_definition_response.text))
    return result

def url_analysis_request(
        query_urls:List[str],
        search_results_str:str,
        cloud_img:Optional[File],
        description:str,
        model_name:str,
        client:genai.Client,
        prompt_template:str,
        num_results:int=3,
        added_context:Optional[str]=None
    ) -> List[str]:
    
    #format the prompt
    prompt = prompt_template
    prompt = prompt.replace(r'{__product_description__}', description)
    prompt = prompt.replace(r'{__search_results_str__}', search_results_str)
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')

    #setup, call, and format response
    if cloud_img is not None:
        contents_list = [cloud_img, prompt]
    else:
        contents_list = [prompt]
    response = client.models.generate_content(
        model=model_name,
        contents=contents_list,
        config=GenerateContentConfig(
            max_output_tokens=20000,
            response_mime_type="application/json",
            response_json_schema={
                "type": "array",
                "items": URLAnalysis.model_json_schema()
            }
        )
    )

    #parse the results
    json_response = json.loads(response.text)
    analysis_results = [URLAnalysisResult(url=query_urls[ii], **item) for ii, item in enumerate(json_response)]
    analysis_results = [item for item in analysis_results if item.valid]
    random.shuffle(analysis_results) #break ties with randomness
    analysis_results = sorted(analysis_results, key= lambda x: x.score, reverse=True)[:num_results]

    best_urls = [item.url for item in analysis_results]

    return best_urls

def product_details_request(url:str, description:str, model_name:str, client:genai.Client, prompt_template:str, added_context:Optional[str]=None) -> ProductInfo:
    
    #format the prompt
    prompt = prompt_template
    prompt = prompt.replace(r'{__link_str__}', url)
    prompt = prompt.replace(r'{__product_description__}', description)
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')
    
    #add a url context tool
    tool = Tool(url_context=UrlContext())

    #query the model
    response = client.models.generate_content(
        model=model_name,
        contents=[
            prompt,
        ],
        config=GenerateContentConfig(
            max_output_tokens=10000,
            tools=[tool],
            response_mime_type="application/json",
            response_json_schema=ProductInfo.model_json_schema())
    )    

    product_details = ProductInfo(**json.loads(response.text))

    return product_details  

def sanity_check_request(product_details:ProductInfo, url:str, model_name:str, client:genai.Client, prompt_template:str, added_context:Optional[str]=None) -> ProductSanityCheck:
    
    #format the prompt
    prompt = prompt_template
    prompt = prompt.replace(r'{__description__}', product_details.name)
    prompt = prompt.replace(r'{__price__}', str(product_details.price))
    prompt = prompt.replace(r'{__URL__}', url)
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')
    
    #print(prompt)

    #query the model
    response = client.models.generate_content(
        model=model_name,
        contents=[
            prompt,
        ],
        config=GenerateContentConfig(
            max_output_tokens=10000,
            response_mime_type="application/json",
            response_json_schema=ProductSanityCheck.model_json_schema())
    )    

    sanity_check_results = ProductSanityCheck(**json.loads(response.text))

    return sanity_check_results


def audio_item_extraction_request(cloud_audio_file:File, model_name:str, client:genai.Client, prompt_template:str, added_context:Optional[str]=None) -> AudioItemExtraction:
    
    prompt = prompt_template #no modification needed now
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')
    
    audio_extraction_response = client.models.generate_content(
        model=model_name,
        contents=[
            Content(parts=[
                Part.from_uri(file_uri=cloud_audio_file.uri, mime_type=cloud_audio_file.mime_type),
                Part.from_text(text=prompt),
            ]),
        ],
        config=GenerateContentConfig(
        max_output_tokens=10000,tools=[],
        response_mime_type="application/json",
        response_json_schema=AudioItemExtraction.model_json_schema())
    )

    audio_item_descriptions = AudioItemExtraction(**json.loads(audio_extraction_response.text))

    return audio_item_descriptions

def actuals_item_extraction_request(cloud_actuals_file:File, model_name:str, client:genai.Client, prompt_template:str, added_context:Optional[str]=None) -> ActualsItemExtraction:
    
    prompt = prompt_template #no modification needed now
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')
    #print(prompt)
    contents_list = [cloud_actuals_file, prompt]
    actuals_extraction_response = client.models.generate_content(
                    model=model_name,
                    contents=contents_list,
                    config=GenerateContentConfig(
                        max_output_tokens=10000,
                        response_mime_type="application/json",
                        response_json_schema=ActualsItemExtraction.model_json_schema()
                    )
                )

    actuals_item_extraction = ActualsItemExtraction(**json.loads(actuals_extraction_response.text))

    return actuals_item_extraction

def added_context_format_request(raw_context:str, model_name:str, client:genai.Client, prompt_template:str) ->str:

    #format and return the added context for the user
    prompt = prompt_template
    prompt = prompt.replace(r'{__raw_context__}', raw_context)
    
    added_context_response = client.models.generate_content(
        model=model_name,
        contents=[prompt],
    )

    return added_context_response.text

def text_description_item_extraction(text_descriptions:str, model_name:str, client:genai.Client, prompt_template:str, added_context:Optional[str]=None) -> AudioItemExtraction:
    prompt = prompt_template
    if added_context is not None:
        prompt = prompt.replace(r'{__added_context__}', added_context)
    else:
        prompt = prompt.replace(r'{__added_context__}', '')
    prompt= prompt_template.replace(r'{__text_descriptions__}', text_descriptions)
    
    audio_extraction_response = client.models.generate_content(
        model=model_name,
        contents=[prompt],
        config=GenerateContentConfig(
        max_output_tokens=10000,tools=[],
        response_mime_type="application/json",
        response_json_schema=AudioItemExtraction.model_json_schema())
    )

    audio_item_descriptions = AudioItemExtraction(**json.loads(audio_extraction_response.text))

    return audio_item_descriptions
