"""One durable sample document per notebook; retries use ordinary ingestion."""
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from services.chat_history import own_notebook
from services.documents import lock_document, finish_ingestion, document_item

logger = logging.getLogger(__name__)
SAMPLE_KEY = "ai-engineering-v1"
SAMPLE_FILENAME = "AI Engineering Sample Textbook.txt"
SAMPLE_TYPE = "text/plain"
SAMPLE_PATH = Path(__file__).resolve().parents[1] / "samples" / "ai-engineering.txt"


async def reserve_sample(db, user_id, notebook_id):
    data = SAMPLE_PATH.read_bytes()
    async with db.transaction() as tx:
        await own_notebook(tx, user_id, notebook_id)
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", f"sample:{user_id}:{notebook_id}:{SAMPLE_KEY}")
        rows = await tx.query('SELECT d.*, EXISTS (SELECT 1 FROM document_deletions x WHERE x."documentId" = d.id) AS "deletionPending" '
            'FROM uploaded_documents d WHERE "userId" = %s::uuid AND "notebookId" = %s::uuid AND "sampleKey" = %s',
            user_id, notebook_id, SAMPLE_KEY)
        if rows and rows[0]["deletionPending"]:
            raise HTTPException(409, "Finish removing the previous sample before loading it again")
        if rows and rows[0]["storageUrl"] != f'{user_id}/{rows[0]["id"]}.txt':
            raise HTTPException(409, "Sample storage metadata requires repair before loading")
        if not rows:
            document_id = str(uuid4())
            rows = await tx.query('INSERT INTO uploaded_documents (id,"userId","notebookId",name,"fileSize","fileType","storageUrl",status,"sampleKey","updatedAt") '
                'VALUES (%s::uuid,%s::uuid,%s::uuid,%s,%s,%s,%s,\'PROCESSING\',%s,NOW()) RETURNING *, FALSE AS "deletionPending"',
                document_id, user_id, notebook_id, SAMPLE_FILENAME, str(len(data)), SAMPLE_TYPE,
                f"{user_id}/{document_id}.txt", SAMPLE_KEY)
        elif rows[0]["status"] != "COMPLETED":
            rows = await tx.query('UPDATE uploaded_documents SET status = \'PROCESSING\', "updatedAt" = NOW() '
                'WHERE id = %s::uuid AND "userId" = %s::uuid AND "notebookId" = %s::uuid '
                'RETURNING *, FALSE AS "deletionPending"', str(rows[0]["id"]), user_id, notebook_id)
    return document_item(rows[0], user_id, notebook_id), data


def index_sample(*, file_bytes, user_id, notebook_id, document_id, storage_path):
    from db.supabase import supabase_client
    from db.qdrant import client
    from qdrant_client import models
    from services.ingestion import process_and_ingest
    from services.status import set_document_status

    set_document_status(document_id=document_id, user_id=user_id, status="processing", filename=SAMPLE_FILENAME)

    # Metadata commits first, and a retry always targets the same owned path.
    # Upsert handles a lost Storage response without orphaning another object.
    supabase_client.storage.from_("textbook-documents").upload(storage_path, file_bytes,
        {"content-type": SAMPLE_TYPE, "upsert": "true"})
    client.delete(collection_name="textbook_chunks", wait=True,
        points_selector=models.FilterSelector(filter=models.Filter(must=[
            models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id)),
            models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id)),
        ])))
    return process_and_ingest(file_bytes=file_bytes, filename=SAMPLE_FILENAME, content_type=SAMPLE_TYPE,
        user_id=user_id, notebook_id=notebook_id, document_id=document_id)


async def persist_sample_ingestion(db, user_id, notebook_id, document_id, file_bytes):
    async with db.transaction() as tx:
        await lock_document(tx, document_id)
        rows = await tx.query('SELECT d.* FROM uploaded_documents d WHERE id = %s::uuid AND "userId" = %s::uuid '
            'AND "notebookId" = %s::uuid AND "sampleKey" = %s '
            'AND NOT EXISTS (SELECT 1 FROM document_deletions x WHERE x."documentId" = d.id)',
            document_id, user_id, notebook_id, SAMPLE_KEY)
        if not rows or rows[0]["status"] == "COMPLETED":
            return
        if rows[0]["storageUrl"] != f"{user_id}/{document_id}.txt":
            await finish_ingestion(tx, user_id, document_id, False)
            return
        try:
            success = await run_in_threadpool(index_sample, file_bytes=file_bytes, user_id=user_id,
                notebook_id=notebook_id, document_id=document_id, storage_path=rows[0]["storageUrl"])
        except Exception:
            logger.warning("Sample textbook indexing failed; its owned reservation remains retryable")
            success = False
            from services.status import set_document_status
            set_document_status(document_id=document_id, user_id=user_id, status="failed")
        await finish_ingestion(tx, user_id, document_id, success)
