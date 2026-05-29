from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from enum import Enum

class ProductCategory(str, Enum):
    # Furniture & Decor
    FURNITURE               = "furniture"
    BEDDING_AND_LINENS      = "bedding_and_linens"
    RUGS_AND_WINDOW_TREATMENTS = "rugs_and_window_treatments"
    LIGHTING                = "lighting"
    ARTWORK_AND_COLLECTIBLES = "artwork_and_collectibles"

    # Electronics & Appliances
    TELEVISIONS_AND_DISPLAYS = "televisions_and_displays"
    COMPUTERS_AND_TABLETS   = "computers_and_tablets"
    SMARTPHONES_AND_CAMERAS = "smartphones_and_cameras"
    AUDIO_AND_HEADPHONES    = "audio_and_headphones"
    GAMING                  = "gaming"
    LARGE_APPLIANCES        = "large_appliances"
    SMALL_APPLIANCES        = "small_appliances"

    # Clothing & Accessories
    CLOTHING                = "clothing"
    SHOES                   = "shoes"
    JEWELRY_AND_WATCHES     = "jewelry_and_watches"
    EYEWEAR                 = "eyewear"
    HANDBAGS_AND_LUGGAGE    = "handbags_and_luggage"

    # Kitchen & Home
    COOKWARE_AND_KITCHENWARE = "cookware_and_kitchenware"
    CLEANING_AND_LAUNDRY    = "cleaning_and_laundry"
    OUTDOOR_AND_GARDEN      = "outdoor_and_garden"

    # Beauty & Personal Care
    BEAUTY_AND_COSMETICS    = "beauty_and_cosmetics"
    PERSONAL_CARE           = "personal_care"

    # Lifestyle & Hobbies
    SPORTING_GOODS          = "sporting_goods"
    TOOLS_AND_HARDWARE      = "tools_and_hardware"
    MUSICAL_INSTRUMENTS     = "musical_instruments"
    TOYS_AND_GAMES          = "toys_and_games"
    BOOKS_AND_MEDIA         = "books_and_media"

    OTHER                   = "other"

class ProductSearchQuery(BaseModel):
    #structured output for finding the product based on the image
    query: str = Field(
        description="A Google search query optimized to return links to product pages for this item"
    )
    description: str = Field(
        description="A ten-word or less description of the item"
    )
    domain: Optional[str] = Field(
        description="The search domain to limit the query to a specific website best suited for finding this item"
    )

class ProductInfo(BaseModel):
    #structured output for finding information from each url
    valid: bool = Field(
        description="Boolean representing if the product URL page is valid or not"
    )

    category: ProductCategory = Field(
        description='The category that the item best fits into. The \'other\' category should be used for all items that do not fit into the preceding named categories'
    )

    name: str = Field(
        description="The item name"
    )
    
    price: float = Field(
        description="A single price for the item"
    )

class ProductList(BaseModel):
    products: List[ProductInfo] = Field(
        description="List of products extracted from the URLs"
    )

class SearchResult(BaseModel):
    index : int 
    url : str
    title : str
    #snippet : str


class SanityCheckResult(str, Enum):
    """Result of the sanity check"""
    VALID = "VALID"
    INVALID = "INVALID"

class FailureReason(str, Enum):
    """Reasons why a product result failed sanity check"""
    PRODUCT_MISMATCH = "Product does not match image description"
    UNREASONABLE_PRICE = "Price is unrealistic (too low, too high, or zero)"
    INVALID_URL = "URL is invalid, placeholder, or missing"
    NON_RETAIL_URL = "URL does not point to a legitimate retail product page"
    MISSING_DATA = "Required product information is missing"
    MULTIPLE_ISSUES = "Multiple validation issues detected"

class ProductSanityCheck(BaseModel):
    """Sanity check validation for product search results"""
    model_config = ConfigDict(use_enum_values=True)
    result: SanityCheckResult = Field(
        ..., 
        description="Overall validation result: VALID or INVALID"
    )
    
    failure_reason: Optional[FailureReason] = Field(
        None,
        description="Specific reason for failure if result is INVALID, None if VALID"
    )
    
    explanation: str = Field(
        ...,
        description="Brief explanation of the validation decision"
    )

class URLAnalysis(BaseModel):
    valid: bool = Field(
        description="Validity or relevance of the search result to finding the product shown or described in the prompt"
    )
    score: int = Field(
        description="Ranking from 1 to 10, with 10 being the best and 1 being the worst, of the relevance and preference of the search result according to the prompt"
    )

class URLAnalysisResult(BaseModel):
    url: str
    valid: bool = Field(
        description="Validity or relevance of the search result to finding the product shown or described in the prompt"
    )
    score: int = Field(
        "Ranking from 1 to 10, with 10 being the best and 1 being the worst, of the relevance and preference of the search result according to the prompt"
    )

class AudioItemExtraction(BaseModel):
    item_descriptions: List[str] = Field(
        description="List of item descriptions, usually ten words or less"
    )

class ActualItem(BaseModel):
    name: str = Field(
        description="The item name or title (without codes or unusual abreviations) extracted from the receipt, invoice, or proof of purchase"
    )
    price: float = Field(
        description="A single price for the item extracted from the receipt, invoice, or proof of purchase"
    )
    category: ProductCategory = Field(
        description='The category that the item best fits into. The \'other\' category should be used for all items that do not fit into the preceding named categories'
    )
    
    quantity: int = Field(
        description="The indicated quantity purchased of this item from the receipt, invoice, or proof of purchase. Default to 1. "
    )

class ActualsItemExtraction(BaseModel):
    actual_items: List[ActualItem] = Field(
        description="List of item actuals"
    )

