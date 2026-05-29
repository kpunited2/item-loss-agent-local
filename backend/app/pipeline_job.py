# pipeline_job.py
from dotenv import load_dotenv
import os
from typing import List
import logging
import queue
import threading

# imports from modules
from app.pipelines import run_audio_pipeline, run_image_pipeline, run_receipt_pipeline, run_description_pipeline
from app.datastore_manager import DatastoreManager
from app.database_models import LocalUploadFile, SourceFileType

# startup and config
logger = logging.getLogger("api")
logger.setLevel(logging.DEBUG)
logger.propagate = False
logger.handlers.clear()
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter(
    fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(module)s:%(funcName)s:%(lineno)d | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logger.addHandler(handler)
load_dotenv()
db = DatastoreManager(os.getenv('DATA_DIR'))

# --- Queue setup ---
_pipeline_queue = queue.Queue()  # unlimited depth

def _queue_worker():
    """Background thread: pulls jobs off the queue and runs them one at a time."""
    while True:
        claim_or_inv_id, files_to_process = _pipeline_queue.get()
        try:
            pipeline_wrapper(claim_or_inv_id, files_to_process)
        except Exception as e:
            logger.error(f"Pipeline worker unhandled exception | claim_or_inv_id={claim_or_inv_id} error={e}", exc_info=True)
        finally:
            _pipeline_queue.task_done()

# Start the single background worker thread (daemon=True so it exits with the process)
_worker_thread = threading.Thread(target=_queue_worker, daemon=True)
_worker_thread.start()

def enqueue_pipeline(claim_or_inv_id: str, files_to_process: List[LocalUploadFile]):
    """Add a pipeline job to the queue. Returns immediately."""
    logger.info(f"Pipeline enqueued | claim_or_inv_id={claim_or_inv_id} queue_depth={_pipeline_queue.qsize()}")
    _pipeline_queue.put((claim_or_inv_id, files_to_process))

def pipeline_wrapper(claim_or_inv_id: str, files_to_process: List[LocalUploadFile]):
    logger.info(f"Pipeline started | claim_or_inv_id={claim_or_inv_id}")

    receipts_files    = [f for f in files_to_process if f.file_type == SourceFileType.RECEIPT]
    images_files      = [f for f in files_to_process if f.file_type == SourceFileType.IMAGE]
    audio_files       = [f for f in files_to_process if f.file_type == SourceFileType.AUDIO]
    description_files = [f for f in files_to_process if f.file_type == SourceFileType.ITEM_DESCRIPTION]

    logger.info(f"Pipeline file breakdown | receipts={len(receipts_files)} images={len(images_files)} audio={len(audio_files)} descriptions={len(description_files)}")

    if receipts_files:
        logger.info(f"Running sub-pipeline: receipts | count={len(receipts_files)}")
        run_receipt_pipeline(claim_or_inv_id, receipts_files, db)

    if images_files:
        logger.info(f"Running sub-pipeline: images | count={len(images_files)}")
        run_image_pipeline(claim_or_inv_id, images_files, db)

    if audio_files:
        logger.info(f"Running sub-pipeline: audio | count={len(audio_files)}")
        run_audio_pipeline(claim_or_inv_id, audio_files, db)

    if description_files:
        logger.info(f"Running sub-pipeline: descriptions | count={len(description_files)}")
        run_description_pipeline(claim_or_inv_id, description_files, db)

    logger.info(f"Pipeline finished | claim_or_inv_id={claim_or_inv_id}")