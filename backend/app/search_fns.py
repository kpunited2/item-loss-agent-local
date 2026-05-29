
import requests
from typing import List, Tuple
from ddgs import DDGS
import time

from app.functional_models import ProductSearchQuery, SearchResult

def google_search(query:str, api_key:str, cx:str, site_search=None, num_results=5) -> dict:
    url = "https://www.googleapis.com/customsearch/v1"
    exclusions = "-inurl:search -inurl:browse -inurl:category -inurl:/s? -inurl:/b/"
    if site_search is None:
        params = {
            "key": api_key,
            "cx": cx,
            "q": f"{query} {exclusions}",
            "num": num_results,
            "gl": "us",  # Geolocation
            "cr": "countryUS",  # Country restrict
        }
    else:
        params = {
            "key": api_key,
            "cx": cx,
            "q": query,
            "num": num_results,
            "siteSearch": site_search,
            "siteSearchFilter": "i", 
            "gl": "us",
            "cr": "countryUS",  # Country restrict
        }

    response = requests.get(url, params=params)
    return response.json()

def search_for_product_pages(product_search_query:ProductSearchQuery, search_api_key:str, cx:str, num_results:int=10) -> Tuple[List[SearchResult], str]:

    #make different search queries with different domain restrictions
    full_web_results = google_search(
        product_search_query.query,
        search_api_key,
        cx,
        site_search=None,
        num_results=num_results
    )
    amazon_results = google_search(
        product_search_query.query,
        search_api_key,
        cx,
        site_search='amazon.com',
        num_results=num_results
    )
    domain_results = {}
    if product_search_query.domain != 'amazon.com':
        domain_results = google_search(
            product_search_query.query,
            search_api_key,
            cx,
            site_search=product_search_query.domain,
            num_results=num_results
        )

    # Concatenate, make unique and then get url from results
    results = []
    results.extend(full_web_results.get("items", []))
    results.extend(amazon_results.get("items", []))
    results.extend(domain_results.get("items", []))
    search_results = []
    query_urls = []
    for ii,item in enumerate(results):
        search_result = SearchResult(
            index=ii,
            url=item['link'],
            title=item['title'],
            #snippet=item['snippet']
        )
        query_urls.append(item['link'])
        search_results.append(search_result)
        

    search_results_str = ''
    for res in search_results:
        search_results_str = search_results_str + res.model_dump_json() + '\n'

    return query_urls, search_results_str

def ddg_search(query: str, site_search: str = None, num_results: int = 5) -> list[dict]:
    exclusions = "-inurl:search -inurl:browse -inurl:category -inurl:/s? -inurl:/b/"
    
    if site_search:
        full_query = f"site:{site_search} {query}"
    else:
        full_query = f"{query} {exclusions}"
    
    with DDGS() as ddgs:
        results = list(ddgs.text(
            full_query,
            region="us-en",
            max_results=num_results
        ))
    
    # Normalize to match Google's `items` structure
    return [{"link": r["href"], "title": r["title"], "snippet": r["body"]} for r in results]


def search_for_product_pages_ddg(product_search_query: ProductSearchQuery, num_results: int = 10) -> Tuple[List[SearchResult], str]:

    full_web_results = ddg_search(product_search_query.query, num_results=num_results)
    time.sleep(2)
    amazon_results = ddg_search(product_search_query.query, site_search="amazon.com", num_results=num_results)
    domain_results = []
    if product_search_query.domain != "amazon.com":
        time.sleep(2)
        domain_results = ddg_search(product_search_query.query, site_search=product_search_query.domain, num_results=num_results)
    results = full_web_results + amazon_results + domain_results
    search_results = []
    query_urls = []
    for ii, item in enumerate(results):
        search_result = SearchResult(
            index=ii,
            url=item["link"],
            title=item["title"],
        )
        query_urls.append(item["link"])
        search_results.append(search_result)

    search_results_str = ""
    for res in search_results:
        search_results_str += res.model_dump_json() + "\n"

    return query_urls, search_results_str


def search_for_product_pages_combined(product_search_query:ProductSearchQuery, search_api_key:str, cx:str, num_results:int=10) -> Tuple[List[SearchResult], str]:

    #make different search queries with different domain restrictions
    full_web_results = google_search(
        product_search_query.query,
        search_api_key,
        cx,
        site_search=None,
        num_results=num_results//2
    )
    amazon_results = google_search(
        product_search_query.query,
        search_api_key,
        cx,
        site_search='amazon.com',
        num_results=num_results//2
    )
    domain_results = {}
    if product_search_query.domain != 'amazon.com':
        domain_results = google_search(
            product_search_query.query,
            search_api_key,
            cx,
            site_search=product_search_query.domain,
            num_results=num_results//2
        )

    full_web_results_1 = ddg_search(product_search_query.query, num_results=num_results//2)
    time.sleep(2)
    amazon_results_1 = ddg_search(product_search_query.query, site_search="amazon.com", num_results=num_results//2)
    domain_results_1 = []
    if product_search_query.domain != "amazon.com":
        time.sleep(2)
        domain_results_1 = ddg_search(product_search_query.query, site_search=product_search_query.domain, num_results=num_results//2)

    # Concatenate, make unique and then get url from results
    results = []
    results.extend(full_web_results.get("items", []))
    results.extend(amazon_results.get("items", []))
    results.extend(domain_results.get("items", []))
    results.extend(full_web_results_1)
    results.extend(amazon_results_1)
    results.extend(domain_results_1)
    search_results = []
    query_urls = []
    for ii,item in enumerate(results):
        search_result = SearchResult(
            index=ii,
            url=item['link'],
            title=item['title'],
            #snippet=item['snippet']
        )
        query_urls.append(item['link'])
        search_results.append(search_result)
        

    search_results_str = ''
    for res in search_results:
        search_results_str = search_results_str + res.model_dump_json() + '\n'

    return query_urls, search_results_str