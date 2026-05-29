from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict, Optional
from enum import Enum
from datetime import datetime, timezone
import uuid

class SourceFileType(str, Enum):
    RECEIPT = "Receipt"
    IMAGE = "Item Image"
    AUDIO = "Audio File"
    ITEM_DESCRIPTION = "Item Description"

class RoomType(str, Enum):
    KITCHEN = "kitchen"
    LIVING_ROOM = "living_room"
    DINING_ROOM = "dining_room"
    BEDROOM = "bedroom"
    BATHROOM = "bathroom"
    OFFICE = "office"
    GARAGE = "garage"
    BASEMENT = "basement"
    ATTIC = "attic"
    LAUNDRY_ROOM = "laundry_room"
    CLOSET = "closet"
    HALLWAY = "hallway"
    OUTDOOR = "outdoor"
    STORAGE = "storage"
    OTHER = "other"
    UNASSIGNED = "unassigned"

class ProductRow(BaseModel):
    model_config = ConfigDict(extra='ignore', use_enum_values=True)  # ignores 'id', 'created_at', etc.

    id:str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    uploaded_file_doc_id : str
    category: str
    name: str
    replacement_price: float
    actual_cash_value: float = 0.0 #support this later
    item_url: Optional[str] = None
    source_file_type: SourceFileType = SourceFileType.ITEM_DESCRIPTION
    source_file_link : str
    date_modified : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    item_notes : Optional[str] = None
    room : RoomType = RoomType.UNASSIGNED
    quantity: int = 1

class ProcessingFileError(BaseModel):
    model_config = ConfigDict(extra='ignore')
    
    exception: Optional[str] = None
    retry_count: int = 0

class ProcessedFiles(BaseModel):
    model_config = ConfigDict(extra='ignore')

    success : List[str]
    error : Dict[str, ProcessingFileError]


class LocalUploadFile(BaseModel):
    model_config = ConfigDict(extra='ignore', use_enum_values=True)

    doc_id: str
    original_filename: str
    mime_type: str
    local_filename: str
    claim_or_inv_id : str
    file_type: SourceFileType = SourceFileType.RECEIPT
    file_added_context: Optional[str] = None
    room : RoomType = RoomType.UNASSIGNED
    quantity: int = 1
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AddedContext(BaseModel):

    raw_text: str
    processed_text: Optional[str] = None
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClaimOrInventory(BaseModel):
    model_config = ConfigDict(extra='ignore', use_enum_values=True)

    doc_id : str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    title : str
    date_created : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_last_updated : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_value : float = 0.0
    active : bool = True
    has_unreplaced_values : bool = True

class InviteCode(BaseModel):
    model_config = ConfigDict(extra='ignore', use_enum_values=True)
    
    active : bool = True
    code : str
    max_uses : int 
    times_used : int = 0

class UserTier(str, Enum):
    FREE = "free"
    INDIVIDUAL = "individual"
    BUSINESS = "business"

class UserInfo(BaseModel):
    model_config = ConfigDict(extra='ignore', use_enum_values=True)

    hashed_code : str
    first_name : str
    last_name : str
    creation_date : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    active : bool = True
    active_payment : bool = False
    access_tier : UserTier = UserTier.FREE
    num_items : int = 0
    total_value : float = 0
    item_limit : int = 25

