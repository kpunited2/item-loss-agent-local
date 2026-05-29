from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, timezone
from typing import List, Optional

class RoomOption(BaseModel):
    value: str
    label: str

class CreateAccountRequest(BaseModel):
    email: str
    invite_code: Optional[str] = None
    first_name: str
    last_name: str

class VerifyEmailRequest(BaseModel):
    email: str
    access_code: str 

class AdminAccessRequest(BaseModel):
    admin_code: str

class AddedContextRequest(BaseModel):
    added_context: str

class GeminiKeyRequest(BaseModel):
    api_key: str

class ItemViewerElement(BaseModel):
    model_config = ConfigDict(extra='ignore')

    index: int = 0
    db_doc_id: str
    uploaded_file_doc_id : str
    category: str
    name: str
    replacement_price: float
    actual_cash_value: float = 0.0 #support this later
    item_url: str|None
    source_file_group: str
    source_file_type: str
    source_file_link: str
    room : str
    quantity : int = 1
    item_notes: str
    date_modified: datetime
    updated: bool = False
    deleted: bool = False
    retry_item_search: bool = False
    move_to_claim : str|None = None

class ItemViewerResponse(BaseModel):
    valid : bool
    claim_options : List[str] = Field(default_factory=list)
    message : Optional[str] = ''
    modified : bool = False
    elements : List[ItemViewerElement] = Field(default_factory=list)


class ClaimOrInventoryElement(BaseModel):
    model_config = ConfigDict(extra='ignore', use_enum_values=True)
    doc_id : Optional[str] = None
    title : str
    date_created : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_last_updated : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_value : float = 0.0
    has_unreplaced_values : bool = True
    modified : bool = False
    deleted : bool = False


class ClaimsAndInventoryResponse(BaseModel):

    claims : List[ClaimOrInventoryElement]

class InviteCodeRequest(BaseModel):

    code : str
    max_uses : int 


    