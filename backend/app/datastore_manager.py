import shutil
import yaml
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Optional

from app.database_models import (
    ClaimOrInventory,
    ProductRow,
    LocalUploadFile,
    ProcessedFiles,
    ProcessingFileError,
    AddedContext,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)


class DatastoreManager:
    """
    Helper class to manage user data stored in files.

    Schema:
    root/
        claims_and_inventories.yaml
        claims/
            {claim_id}/
                item_data.yaml          # keyed by doc_id -> ProductRow
                processed_files.yaml    # { success: [...], error: {...} }
                uploaded_files.yaml     # keyed by doc_id -> LocalUploadFile
                added_context.yaml      # { raw_text, processed_text, upload_date }
                files/                  # actual uploaded file bytes
    """
    ACTIVE_INVENTORY_ID = 'active_inventory'

    def __init__(self, data_folder: str | Path):
        self.data_folder = Path(data_folder)
        self.data_folder.mkdir(parents=True, exist_ok=True)

        self.claims_file = self.data_folder / "claims_and_inventories.yaml"

        if not self.claims_file.exists():
            _write_yaml(self.claims_file, {})

    # ─── Claim folder paths ───

    def _claim_folder(self, claim_id: str) -> Path:
        return self.data_folder / "claims" / claim_id

    def _item_data_file(self, claim_id: str) -> Path:
        return self._claim_folder(claim_id) / "item_data.yaml"

    def _processed_files_file(self, claim_id: str) -> Path:
        return self._claim_folder(claim_id) / "processed_files.yaml"

    def _uploaded_files_file(self, claim_id: str) -> Path:
        return self._claim_folder(claim_id) / "uploaded_files.yaml"

    def _added_context_file(self, claim_id: str) -> Path:
        return self._claim_folder(claim_id) / "added_context.yaml"

    def files_folder(self, claim_id: str) -> Path:
        return self._claim_folder(claim_id) / "files"

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    #  Claims / Inventories
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def get_all_claims_and_inventories(self) -> List[ClaimOrInventory]:
        claims = _read_yaml(self.claims_file)
        return [ClaimOrInventory(**data) for data in claims.values() if data['doc_id'] != self.ACTIVE_INVENTORY_ID]

    def get_claim(self, claim_id: str) -> Optional[ClaimOrInventory]:
        claims = _read_yaml(self.claims_file)
        claim_data = claims.get(claim_id)
        if not claim_data:
            return None
        return ClaimOrInventory(**claim_data)

    def get_active_inventory(self):
        return self.get_claim(self.ACTIVE_INVENTORY_ID)

    def add_claim(self, claim: ClaimOrInventory) -> str:
        claims = _read_yaml(self.claims_file)
        if claim.doc_id in claims:
            raise ValueError(f"Claim '{claim.doc_id}' already exists")

        claims[claim.doc_id] = claim.model_dump(mode="json")
        _write_yaml(self.claims_file, claims)

        # Create claim folder structure
        self.files_folder(claim.doc_id).mkdir(parents=True, exist_ok=True)
        _write_yaml(self._item_data_file(claim.doc_id), {})
        _write_yaml(self._processed_files_file(claim.doc_id), {"success": [], "error": {}})
        _write_yaml(self._uploaded_files_file(claim.doc_id), {})

        return claim.doc_id

    def update_claim(self, claim_id: str, claim: ClaimOrInventory) -> None:
        claims = _read_yaml(self.claims_file)
        if claim_id not in claims:
            raise KeyError(f"Claim '{claim_id}' not found")

        data = claim.model_dump(mode="json")
        data["date_last_updated"] = _now().isoformat()
        claims[claim_id] = data
        _write_yaml(self.claims_file, claims)

    def delete_claim(self, claim_id: str) -> None:
        claims = _read_yaml(self.claims_file)
        if claim_id not in claims:
            raise KeyError(f"Claim '{claim_id}' not found")

        del claims[claim_id]
        _write_yaml(self.claims_file, claims)

        folder = self._claim_folder(claim_id)
        if folder.exists():
            shutil.rmtree(folder)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    #  Uploaded Files
    #  Stored in: claims/{claim_id}/uploaded_files.yaml
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def add_uploaded_file(self, claim_id: str, file: LocalUploadFile) -> str:
        path = self._uploaded_files_file(claim_id)
        files = _read_yaml(path)
        files[file.doc_id] = file.model_dump(mode="json")
        _write_yaml(path, files)
        return file.doc_id

    def get_uploaded_file(self, claim_id: str, file_id: str) -> Optional[LocalUploadFile]:
        files = _read_yaml(self._uploaded_files_file(claim_id))
        data = files.get(file_id)
        if not data:
            return None
        return LocalUploadFile(**data)

    def get_uploaded_files(self, claim_id: str) -> List[LocalUploadFile]:
        files = _read_yaml(self._uploaded_files_file(claim_id))
        return [LocalUploadFile(**data) for data in files.values()]

    def update_uploaded_file(self, claim_id: str, file_id: str, file: LocalUploadFile) -> None:
        path = self._uploaded_files_file(claim_id)
        files = _read_yaml(path)
        if file_id not in files:
            raise KeyError(f"Uploaded file '{file_id}' not found in claim '{claim_id}'")
        files[file_id] = file.model_dump(mode="json")
        _write_yaml(path, files)

    def delete_uploaded_file(self, claim_id: str, file_id: str) -> None:
        path = self._uploaded_files_file(claim_id)
        files = _read_yaml(path)
        if file_id not in files:
            raise KeyError(f"Uploaded file '{file_id}' not found in claim '{claim_id}'")

        # Remove the physical file if it exists
        file_data = files[file_id]
        local_name = file_data.get("local_filename")
        if local_name:
            phys = self.files_folder(claim_id) / local_name
            phys.unlink(missing_ok=True)

        del files[file_id]
        _write_yaml(path, files)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    #  Item Data (ProductRows)
    #  Stored in: claims/{claim_id}/item_data.yaml
    #  Keyed by an auto-generated row id, grouped under file_group
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def add_item(self, claim_id: str, row: ProductRow) -> str:
        path = self._item_data_file(claim_id)
        items = _read_yaml(path)
        key = row.id
        items[key] = row.model_dump(mode="json")
        _write_yaml(path, items)
        return key

    def add_items_batch(self, claim_id: str, rows: List[ProductRow]) -> List[str]:
        path = self._item_data_file(claim_id)
        items = _read_yaml(path)
        keys = []
        for row in rows:
            key = row.id
            items[key] = row.model_dump(mode="json")
            keys.append(key)
        _write_yaml(path, items)
        return keys

    def get_item(self, claim_id: str, item_id: str) -> Optional[ProductRow]:
        items = _read_yaml(self._item_data_file(claim_id))
        data = items.get(item_id)
        if not data:
            return None
        return ProductRow(**data)

    def get_all_items(self, claim_id: str) -> List[ProductRow]:
        items = _read_yaml(self._item_data_file(claim_id))
        return [ProductRow(**v) for k, v in items.items()]

    def update_item(self, claim_id: str, item_id: str, row: ProductRow) -> None:
        path = self._item_data_file(claim_id)
        items = _read_yaml(path)
        if item_id not in items:
            raise KeyError(f"Item '{item_id}' not found in claim '{claim_id}'")
        data = row.model_dump(mode="json")
        data["date_modified"] = _now().isoformat()
        items[item_id] = data
        _write_yaml(path, items)

    def delete_item(self, claim_id: str, item_id: str) -> None:
        path = self._item_data_file(claim_id)
        items = _read_yaml(path)
        if item_id not in items:
            raise KeyError(f"Item '{item_id}' not found in claim '{claim_id}'")
        del items[item_id]
        _write_yaml(path, items)

    def delete_items_by_uploaded_file(self, claim_id: str, uploaded_file_doc_id: str) -> int:
        """Remove all items that came from a specific uploaded file. Returns count deleted."""
        path = self._item_data_file(claim_id)
        items = _read_yaml(path)
        to_delete = [k for k, v in items.items() if v.get("uploaded_file_doc_id") == uploaded_file_doc_id]
        for k in to_delete:
            del items[k]
        _write_yaml(path, items)
        return len(to_delete)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    #  Processed Files
    #  Stored in: claims/{claim_id}/processed_files.yaml
    #  Schema: { success: [filename, ...], error: { filename: {exception, retry_count} } }
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def get_processed_files(self, claim_id: str) -> ProcessedFiles:
        data = _read_yaml(self._processed_files_file(claim_id))
        data.setdefault("success", [])
        data.setdefault("error", {})
        return ProcessedFiles(**data)

    def set_processed_files(self, claim_id: str, data: ProcessedFiles) -> None:
        _write_yaml(self._processed_files_file(claim_id), data.model_dump(mode="json"))

    def add_processed_success(self, claim_id: str, filename: str) -> None:
        path = self._processed_files_file(claim_id)
        data = _read_yaml(path)
        data.setdefault("success", [])
        if filename not in data["success"]:
            data["success"].append(filename)
        _write_yaml(path, data)

    def add_processed_error(self, claim_id: str, filename: str, error: ProcessingFileError) -> None:
        path = self._processed_files_file(claim_id)
        data = _read_yaml(path)
        data.setdefault("error", {})
        data["error"][filename] = error.model_dump(mode="json")
        _write_yaml(path, data)

    def remove_processed_error(self, claim_id: str, filename: str) -> None:
        path = self._processed_files_file(claim_id)
        data = _read_yaml(path)
        data.get("error", {}).pop(filename, None)
        _write_yaml(path, data)

    def reset_processed_files(self, claim_id: str) -> None:
        _write_yaml(self._processed_files_file(claim_id), {"success": [], "error": {}})

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    #  Added Context
    #  Stored in: claims/{claim_id}/added_context.yaml
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def set_added_context(self, claim_id: str, context: AddedContext) -> None:
        _write_yaml(self._added_context_file(claim_id), context.model_dump(mode="json"))

    def get_added_context(self, claim_id: str) -> Optional[AddedContext]:
        data = _read_yaml(self._added_context_file(claim_id))
        if not data:
            return None
        return AddedContext(**data)

    def delete_added_context(self, claim_id: str) -> None:
        path = self._added_context_file(claim_id)
        if path.exists():
            path.unlink()