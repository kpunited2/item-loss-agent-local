from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pi_heif import register_heif_opener
from PIL import Image
import io
from dotenv import load_dotenv
import asyncio
import uuid
import os
import pandas as pd
import logging
import socket
import io
import pandas as pd
from datetime import datetime, timezone
import mimetypes
from typing import List, Dict, Optional
from google import genai
from google.genai.types import HttpOptions

#imports from modules
from app.request_models import (AddedContextRequest, ClaimsAndInventoryResponse, ItemViewerElement, ItemViewerResponse, ClaimOrInventoryElement, RoomOption,
                                GeminiKeyRequest, )
from app.database_models import LocalUploadFile,SourceFileType, AddedContext, ProductRow, ClaimOrInventory, InviteCode, UserInfo, RoomType
from app.logging_fns import LoggingMiddleware
from app.pipeline_job import enqueue_pipeline
from app.datastore_manager import DatastoreManager

#startup and config
load_dotenv()
DATA_FOLDER = Path(os.getenv('DATA_DIR'))
ENV_FILE = Path(os.getenv("DATA_DIR")) / "runtime.env" #works with mounted volume when containerized
if ENV_FILE.exists():
    load_dotenv(ENV_FILE, override=True)

# --- Initialize logger ONCE here ---
logger = logging.getLogger("api")
logger.setLevel(logging.DEBUG)
logger.handlers.clear()
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter(
    fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(module)s:%(funcName)s:%(lineno)d | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logger.addHandler(handler)
register_heif_opener()

#set up file datastore managing
db = DatastoreManager(DATA_FOLDER)

#FASTAPI setup
app = FastAPI()
app.add_middleware(LoggingMiddleware)
app.router.redirect_slashes = False
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
            "http://localhost:3000",       # React dev server
            "http://localhost:5173",       # Vite dev server
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#mount files that can be viewed in web app
app.mount(
    "/local_files",
    StaticFiles(directory=os.getenv('DATA_DIR')),
    name="local_files",
)


CHUNK_SIZE = 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    # Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/heic",
    "image/tiff",
    "image/x-icon",
    "image/avif",
    "image/apng",
    # PDF
    "application/pdf",
    # Audio
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/flac",
    "audio/x-m4a",
    "audio/mp4",
}
IMAGE_SUFFIXES = ['.jpg', '.JPG', '.png', '.PNG', '.HEIC', '.heic', '.pdf', '.PDF']

def convert_heic(data: bytes) -> bytes:
    img = Image.open(io.BytesIO(data))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()

def _write_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

async def process_and_save_text(
    text: str,
    claim_id: str,
    uploaded_file: LocalUploadFile,
    db: DatastoreManager,
) -> dict:
    contents = text.encode("utf-8")

    await asyncio.to_thread(
        _write_file,
        Path(uploaded_file.local_filename),
        contents,
    )
    doc_id = await asyncio.to_thread(db.add_uploaded_file, claim_id, uploaded_file)

    logger.info(f"Text file saved | claim_id={claim_id} filename={uploaded_file.original_filename}")

    return {
        "filename": uploaded_file.original_filename,
        "local_path": uploaded_file.local_filename,
        "doc_id": doc_id,
        "status": "success",
    }

async def process_and_copy(
    file: UploadFile,
    claim_id: str,
    uploaded_file: LocalUploadFile,
    db: DatastoreManager,
) -> dict:
    contents = await file.read()

    if Path(file.filename).suffix.lower() in ['.heic', '.heif']:
        contents = await asyncio.to_thread(convert_heic, contents)

    await asyncio.to_thread(
        _write_file,
        Path(uploaded_file.local_filename),
        contents,
    )
    doc_id = await asyncio.to_thread(db.add_uploaded_file, claim_id, uploaded_file)

    logger.info(f"File copied to folder | claim_id={claim_id} filename={uploaded_file.original_filename}")

    return {
        "filename": uploaded_file.original_filename,
        "local_path": uploaded_file.local_filename,
        "doc_id": doc_id,
        "status": "success",
    }

async def validate_file_type(file: UploadFile) -> bool:
    content_type = file.content_type or ""
    ext = Path(file.filename).suffix.lower()
    return (
        content_type.startswith("image/")
        or content_type.startswith("audio/")
        or content_type == "application/pdf"
        or ext in IMAGE_SUFFIXES
    )
@app.get("/ping")
async def ping():
    return JSONResponse(content={"status": "ok"}, status_code=200)

@app.get("/get_local_network_ip")
async def get_local_network_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("8.8.8.8", 80))  # Doesn't actually send anything
        ip = s.getsockname()[0]
    logger.info(f"Local network IP requested | ip={ip}")
    return JSONResponse(content={"ip": ip}, status_code=200)

@app.get("/config/gemini-key-status")
def gemini_key_status():
    key = os.getenv("GEMINI_API_KEY")
    if not (key and key.strip()):
        return {"configured": False}

    # Validate the configured key against the Gemini API
    try:
        test_client = genai.Client(
            http_options=HttpOptions(timeout=10_000),  # 10s
            api_key=key.strip(),
        )
        # list_models is free + fast — just checks auth
        list(test_client.models.list())
    except Exception as e:
        logger.warning(f"Configured Gemini API key failed validation | error={e}")
        return {"configured": False}

    return {"configured": True}

@app.post("/config/gemini-key")
def set_gemini_key(req: GeminiKeyRequest):
    key = req.api_key.strip()
    if not key:
        raise HTTPException(400, "Empty key")
    if "\n" in key or "\r" in key:
        raise HTTPException(400, "Invalid key format")

    # Validate against Gemini API before persisting
    try:
        test_client = genai.Client(
            http_options=HttpOptions(timeout=10_000),  # 10s
            api_key=key,
        )
        # list_models is free + fast — just checks auth
        list(test_client.models.list())
    except Exception as e:
        msg = str(e).lower()
        if "api key" in msg or "unauthenticated" in msg or "permission" in msg or "401" in msg or "403" in msg:
            raise HTTPException(400, "Invalid API key")
        raise HTTPException(400, f"Key validation failed: {e}")

    # Persist — key is valid
    lines = []
    if ENV_FILE.exists():
        lines = ENV_FILE.read_text().splitlines()
    lines = [l for l in lines if not l.startswith("GEMINI_API_KEY=")]
    lines.append(f'GEMINI_API_KEY="{key}"')
    ENV_FILE.write_text("\n".join(lines) + "\n")

    os.environ["GEMINI_API_KEY"] = key
    from app import pipelines
    pipelines.reset_client()
    return {"ok": True}

@app.get("/get_items/{claim_or_inv_id}", response_model=ItemViewerResponse)
async def get_items(claim_or_inv_id: str) -> ItemViewerResponse:

    results = db.get_all_items(claim_or_inv_id)

    if len(results) == 0:
        return ItemViewerResponse(valid=False, message='No Items Found')

    sorted_results = sorted(results, key=lambda x: x.date_modified, reverse=True)

    item_viewer_elements = []
    for ii, res in enumerate(sorted_results):
        item_notes = res.item_notes
        item_element = ItemViewerElement(
            index=ii,
            db_doc_id=res.id,
            uploaded_file_doc_id=res.uploaded_file_doc_id,
            name=res.name,
            category=res.category,
            replacement_price=res.replacement_price,
            item_url=res.item_url,
            source_file_type=res.source_file_type,
            source_file_link=res.source_file_link,
            source_file_group='actuals',
            item_notes=item_notes if item_notes is not None else '',
            date_modified=res.date_modified,
            updated=False,
            deleted=False,
            retry_item_search=False,
            move_to_claim=None,
            quantity=res.quantity,
            room=res.room,
        )
        item_viewer_elements.append(item_element)

    claim_docs = db.get_all_claims_and_inventories()
    claim_titles = [claim.title for claim in claim_docs if claim.title != 'active_inventory' and claim.doc_id != claim_or_inv_id]

    response = ItemViewerResponse(valid=True, elements=item_viewer_elements, claim_options=claim_titles)

    return response

@app.post("/update_items/{claim_or_inv_id}")
async def update_items(claim_or_inv_id: str, item_viewer_response: ItemViewerResponse):
    if not item_viewer_response.modified:
        return {'valid': True, 'message': 'No changes'}

    if any([True for item_element in item_viewer_response.elements if item_element.move_to_claim]):
        claim_docs = db.get_all_claims_and_inventories(claim_or_inv_id)
        claim_titles_to_id = {claim_doc.title: claim_doc.doc_id for claim_doc in claim_docs}

    deleted_count = 0
    updated_count = 0
    retry_count = 0
    files_to_process = []
    touched_claim_ids = set()  # recalc these at end

    for item_element in item_viewer_response.elements:
        source_file_type = item_element.source_file_type
        doc_id = item_element.db_doc_id
        qty = item_element.quantity

        if item_element.deleted:
            db.delete_item(claim_or_inv_id, item_element.db_doc_id)
            if source_file_type == 'Item Image':
                db.delete_uploaded_file(claim_or_inv_id, file_id=item_element.uploaded_file_doc_id)
            deleted_count += 1
            continue

        if item_element.move_to_claim is not None:
            db.delete_item(claim_or_inv_id, item_element.db_doc_id)

            prod_row = ProductRow(
                uploaded_file_doc_id=item_element.uploaded_file_doc_id,
                category=item_element.category,
                name=item_element.name,
                replacement_price=item_element.replacement_price,
                actual_cash_value=item_element.actual_cash_value,
                item_url=item_element.item_url,
                item_notes=item_element.item_notes,
                source_file_group=item_element.source_file_group,
                source_file_type=item_element.source_file_type,
                source_file_link=item_element.source_file_link,
                date_modified=item_element.date_modified,
                room=item_element.room,
                quantity=qty
            )

            new_claim_name = item_element.move_to_claim
            new_claim_id = claim_titles_to_id[new_claim_name]
            db.add_item(new_claim_id, prod_row)
            touched_claim_ids.add(new_claim_id)
            continue

        if item_element.updated:
            updated_row = ProductRow(id=item_element.db_doc_id, **item_element.model_dump())
            updated_row.date_modified = datetime.now(timezone.utc)
            db.update_item(claim_or_inv_id, doc_id, updated_row)

            if item_element.item_notes and len(item_element.item_notes) > 0:
                uploaded_file_doc_id = item_element.uploaded_file_doc_id
                upload_data = db.get_uploaded_file(claim_or_inv_id, uploaded_file_doc_id)
                upload_data.file_added_context = item_element.item_notes
                db.update_uploaded_file(claim_or_inv_id, uploaded_file_doc_id, upload_data)

            updated_count += 1

        if item_element.retry_item_search and item_element.source_file_type != 'receipts':
            if item_element.source_file_type == 'Item Image':
                base_name = os.path.basename(item_element.source_file_link)
                proccessed_files = db.get_processed_files(claim_or_inv_id)
                proccessed_files_success = set(proccessed_files.success)
                proccessed_files_success.discard(base_name)
                _ = proccessed_files.error.pop(base_name, None)
                proccessed_files.success = list(proccessed_files_success)
                db.set_processed_files(claim_or_inv_id, proccessed_files)

                uploaded_file = db.get_uploaded_file(claim_or_inv_id, file_id=item_element.uploaded_file_doc_id)
                if uploaded_file is not None:
                    if item_element.item_notes is not None and len(item_element.item_notes) > 0:
                        uploaded_file.file_added_context = uploaded_file.file_added_context + f'\nWith added notes: {item_element.item_notes}\n'
                    uploaded_file.quantity = item_element.quantity
                    uploaded_file.room = item_element.room
                    files_to_process.append(uploaded_file)

            elif item_element.source_file_type == 'Item Description' or item_element.source_file_type == 'Audio File':
                description_text = f'Item Description: {item_element.name}\n'
                if item_element.item_notes is not None and len(item_element.item_notes) > 0:
                    description_text += f'With added notes: {item_element.item_notes}\n'
                description_text += f'Extracted from {item_element.source_file_link}\n'

                local_filename = DATA_FOLDER / 'claims' / claim_or_inv_id / 'files' / f'csh_file_{uuid.uuid4().hex[:8]}.txt'
                new_text_file = LocalUploadFile(
                    doc_id=uuid.uuid4().hex[:8],
                    original_filename='NA',
                    mime_type='text/plain',
                    claim_or_inv_id=claim_or_inv_id,
                    local_filename=str(local_filename),
                    file_type=SourceFileType.ITEM_DESCRIPTION,
                    quantity=qty,
                    room=item_element.room
                )

                await process_and_save_text(description_text, claim_or_inv_id, new_text_file, db)
                files_to_process.append(new_text_file)

            db.delete_item(claim_or_inv_id, doc_id)
            retry_count += 1

    # recalc totals from scratch for source claim + any move destinations
    touched_claim_ids.add(claim_or_inv_id)
    for cid in touched_claim_ids:
        items = db.get_all_items(cid)
        new_total = round(sum(i.replacement_price * i.quantity for i in items), 2)
        claim_info = db.get_claim(cid)
        claim_info.total_value = new_total
        db.update_claim(cid, claim_info)

    if len(files_to_process) > 0:
        enqueue_pipeline(claim_or_inv_id, files_to_process)
        logger.info(f"Pipeline job auto-queued after item update | claim_or_inv_id={claim_or_inv_id} file_count={len(files_to_process)}")

    logger.info(f"Items updated | claim_or_inv_id={claim_or_inv_id} deleted={deleted_count} updated={updated_count} retried={retry_count}")

    return {'valid': True, 'message': 'Item Changes Saved'}

@app.get("/export_items/{claim_or_inv_id}")
async def export_items(claim_or_inv_id: str):
    results = db.get_all_items(claim_or_inv_id)
    if len(results) == 0:
        return {"valid": False, "message": "No Items to Export"}

    sorted_results = sorted(results, key=lambda x: x.date_modified, reverse=True)
    sorted_results = [res.model_dump() for res in sorted_results]

    today = datetime.now().strftime("%m%d%y")
    csv_file = Path(DATA_FOLDER) / 'claims' / claim_or_inv_id / f"Item_Loss_Agent_Results_{today}.csv"
    df = pd.DataFrame(sorted_results)

    # compute totals
    df['total_price'] = (df['quantity'] * df['replacement_price']).round(2)
    df['cumulative_total'] = df['total_price'].cumsum().round(2)

    df = df[['name', 'category', 'room', 'quantity', 'replacement_price',
             'total_price', 'cumulative_total',
             'item_url', 'source_file_type', 'source_file_link', 'item_notes']]
    df.to_csv(csv_file, index=False, na_rep="N/A")

    logger.info(f"Items exported | claim_or_inv_id={claim_or_inv_id} file={csv_file.name} row_count={len(df)}")

    return FileResponse(
        path=csv_file,
        media_type="text/csv",
        filename=f"Item_Loss_Agent_Results_{today}.csv"
    )

@app.get("/get_added_context/{claim_or_inv_id}")
async def get_added_context(claim_or_inv_id: str):
    ac = db.get_added_context(claim_or_inv_id)
    if ac is not None:
        return {"valid": True, "message": ac.raw_text}
    else:
        return {"valid": False, "message": ""}

@app.post("/write_added_context/{claim_or_inv_id}")
async def write_added_context(request: AddedContextRequest, claim_or_inv_id: str):
    ac = AddedContext(
        raw_text=request.added_context,
        processed_text=None,
    )
    _ = db.set_added_context(claim_or_inv_id, ac)
    return JSONResponse(
        content={"message": "Added Context Saved."},
        status_code=200,
    )

@app.get("/get_claims_and_inventory/", response_model=ClaimsAndInventoryResponse)
async def get_claims() -> ClaimsAndInventoryResponse:
    claims = db.get_all_claims_and_inventories()
    inv = db.get_active_inventory()
    if inv is None:
        inv = ClaimOrInventory(doc_id=db.ACTIVE_INVENTORY_ID, title='Active Inventory', has_unreplaced_values=False)
        db.add_claim(inv)

    claims_and_inv = [inv] + sorted(claims, key=lambda x: x.date_last_updated, reverse=True)
    claims_and_inv_elements = [ClaimOrInventoryElement(**c_or_inv.model_dump()) for c_or_inv in claims_and_inv]

    return ClaimsAndInventoryResponse(claims=claims_and_inv_elements)

@app.get("/get_room_types", response_model=List[RoomOption])
async def get_room_types() -> List[RoomOption]:
    return [
        RoomOption(value=room.value, label=room.value.replace("_", " ").title())
        for room in RoomType
    ]

@app.post("/add_claim/", response_model=ClaimOrInventoryElement)
async def add_claim(claim: ClaimOrInventoryElement):
    new_claim = ClaimOrInventory(title=claim.title)
    existing_claims = db.get_all_claims_and_inventories()
    if any(c.title.strip().lower() == claim.title.strip().lower() for c in existing_claims):
        logger.warning(f"Duplicate claim creation attempted | title={claim.title}")
        raise HTTPException(status_code=409, detail="A claim with this name already exists.")
    db.add_claim(new_claim)
    logger.info(f"Claim created | title={claim.title}")
    return JSONResponse(
        content={"message": "Claim Created."},
        status_code=200,
    )

@app.post("/upload_text_descriptions/{claim_or_inv_id}")
async def upload_text_descriptions(
        claim_or_inv_id: str,
        description_text: Optional[str] = None
    ):
    if description_text is None:
        return JSONResponse(content={"message": "No Descriptions to Save."}, status_code=400)

    local_filename = DATA_FOLDER / 'claims' / claim_or_inv_id / 'files' / f'csh_file_{uuid.uuid4().hex[:8]}.txt'
    uploaded_file = LocalUploadFile(
        doc_id=uuid.uuid4().hex[:8],
        original_filename='NA',
        mime_type='text/plain',
        claim_or_inv_id=claim_or_inv_id,
        local_filename=str(local_filename),
        file_type=SourceFileType.ITEM_DESCRIPTION,
    )

    await process_and_save_text(description_text, claim_or_inv_id, uploaded_file, db)

    enqueue_pipeline(claim_or_inv_id, [uploaded_file])
    logger.info(f"Pipeline job auto-queued after text upload | claim_or_inv_id={claim_or_inv_id}")

    return JSONResponse(content={"message": "Descriptions Saved."}, status_code=200)

@app.post("/upload/{claim_or_inv_id}")
async def upload_files(
    claim_or_inv_id: str,
    notes: list[str] = Form(default=[]),
    files: list[UploadFile] = File(...),
    upload_type: str = "Item Images",
    rooms: List[str] = Form(default=[]),
    quantities: List[int] = Form(default=[])
):
    upload_type = upload_type[:-1] if upload_type[-1] == 's' else upload_type
    logger.info(f"Upload request received | claim_or_inv_id={claim_or_inv_id} file_count={len(files)} upload_type={upload_type}")

    errors = []
    tasks = []
    files_to_process = []
    for ii, file in enumerate(files):
        if not await validate_file_type(file):
            errors.append({"filename": file.filename, "error": "File must be images, pdfs, or audio files"})
            continue

        new_file_base = uuid.uuid4().hex[:8]
        old_suffix = Path(file.filename).suffix

        if old_suffix.lower() in ['.heic', '.heif']:
            final_suffix = '.jpg'
        else:
            final_suffix = old_suffix

        local_filename = DATA_FOLDER / 'claims' / claim_or_inv_id / 'files' / f'csh_file_{new_file_base}{final_suffix}'

        mime_type, _ = mimetypes.guess_type(local_filename)
        if mime_type is None:
            mime_type = 'application/octet-stream'

        item_notes = notes[ii] if ii < len(notes) else None
        if item_notes is not None and len(item_notes) == 0:
            item_notes = None

        # Parse room — fall back to UNASSIGNED if missing or invalid
        raw_room = rooms[ii] if ii < len(rooms) else None
        #print(raw_room)
        try:
            room = RoomType(raw_room) if raw_room else RoomType.UNASSIGNED
        except ValueError:
            logger.warning(f"Invalid room value '{raw_room}' for file {file.filename}, defaulting to UNASSIGNED")
            room = RoomType.UNASSIGNED

        # Parse quantity — clamp to min 1
        raw_qty = quantities[ii] if ii < len(quantities) else 1
        try:
            quantity = max(1, int(raw_qty))
        except (ValueError, TypeError):
            quantity = 1

        uploaded_file = LocalUploadFile(
            doc_id=uuid.uuid4().hex[:8],
            original_filename=file.filename,
            mime_type=mime_type,
            claim_or_inv_id=claim_or_inv_id,
            local_filename=str(local_filename),
            file_type=SourceFileType(upload_type),
            file_added_context=item_notes,
            room=room,
            quantity=quantity,
        )
        #print(uploaded_file)
        files_to_process.append(uploaded_file)
        tasks.append(process_and_copy(file, claim_or_inv_id, uploaded_file, db))

    save_results = await asyncio.gather(*tasks)
    results = [r for r in save_results if r["status"] == "success"]
    errors += [r for r in save_results if r["status"] == "failed"]

    if errors:
        logger.warning(f"Some uploads failed | claim_or_inv_id={claim_or_inv_id} success_count={len(results)} error_count={len(errors)}")

    if not results and errors:
        raise HTTPException(status_code=400, detail={"message": "All uploads failed", "errors": errors})

    enqueue_pipeline(claim_or_inv_id, files_to_process)
    logger.info(f"Pipeline job auto-queued after upload | claim_or_inv_id={claim_or_inv_id} file_count={len(files_to_process)}")

    return JSONResponse(
        content={
            "message": f"{len(results)} file(s) uploaded successfully",
            "results": results,
            "errors": errors,
        },
        status_code=200,
    )


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting server on localhost:8257")
    uvicorn.run(app, host="localhost", port=8257)