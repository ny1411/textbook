"""Retryable cross-store deletion; PostgreSQL journals intent before remote I/O."""
import logging

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from services.chat_history import own_notebook
from services.documents import lock_document, own_document

logger = logging.getLogger(__name__)


def cleanup_external_stores(user_id, document_id, storage_path):
    # Lazy imports keep metadata routes independent of Storage/vector startup.
    from db.qdrant import client
    from qdrant_client import models
    from services.storage import delete_file_from_supabase
    from services.caching import invalidate_user_cache
    from services.status import clear_document_status

    if storage_path:
        delete_file_from_supabase("textbook-documents", storage_path)
    client.delete(
        collection_name="textbook_chunks",
        points_selector=models.FilterSelector(filter=models.Filter(must=[
            models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id)),
            models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id)),
        ])),
        wait=True,
    )
    # Unlike ordinary cache writes, cleanup must not silently swallow failures.
    invalidate_user_cache(user_id, strict=True)
    clear_document_status(user_id, document_id)


async def delete_document(db, user_id, notebook_id, document_id):
    # Persist intent separately: rollback after a provider failure must retain
    # the path/owner and keep this source out of subsequent retrieval.
    async with db.transaction() as tx:
        await own_notebook(tx, user_id, notebook_id)
        await lock_document(tx, document_id)
        journal = await tx.query('SELECT * FROM document_deletions WHERE "documentId" = %s::uuid '
            'AND "userId" = %s::uuid AND "notebookId" = %s::uuid', document_id, user_id, notebook_id)
        if not journal:
            document = await own_document(tx, user_id, document_id)
            if str(document["notebookId"]) != notebook_id:
                raise HTTPException(404, "Source not found in this notebook")
            path = document["storageUrl"]
            if path and (not path.startswith(user_id + "/") or any(part in {"", ".", ".."} for part in path.split("/"))):
                raise HTTPException(409, "Source storage path requires repair before deletion")
            await tx.execute('INSERT INTO document_deletions ("documentId", "userId", "notebookId", "storagePath") '
                'VALUES (%s::uuid, %s::uuid, %s::uuid, %s)', document_id, user_id, notebook_id, path)

    try:
        async with db.transaction() as tx:
            await own_notebook(tx, user_id, notebook_id)
            # The same lock surrounds ingestion, so no worker can upload chunks
            # after deletion or race a concurrent retry. It works across replicas.
            await lock_document(tx, document_id)
            rows = await tx.query('SELECT * FROM document_deletions WHERE "documentId" = %s::uuid '
                'AND "userId" = %s::uuid AND "notebookId" = %s::uuid', document_id, user_id, notebook_id)
            if not rows:
                raise HTTPException(404, "Source not found")
            if rows[0]["completedAt"] is None:
                await run_in_threadpool(cleanup_external_stores, user_id, document_id, rows[0]["storagePath"])
                # Existing FK cascades remove conversation_documents and
                # message_sources. Both the row removal and tombstone commit
                # together, only after every external cleanup acknowledges.
                await tx.execute('DELETE FROM uploaded_documents WHERE id = %s::uuid '
                    'AND "userId" = %s::uuid AND "notebookId" = %s::uuid', document_id, user_id, notebook_id)
                await tx.execute('UPDATE document_deletions SET "completedAt" = NOW(), "storagePath" = NULL '
                    'WHERE "documentId" = %s::uuid', document_id)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise
        logger.warning("Document deletion remains pending after external cleanup failure")
        raise HTTPException(503, "Source deletion is pending. Retry removal to finish cleanup.", headers={"Retry-After": "2"}) from None
    except Exception:
        logger.warning("Document deletion remains pending after cleanup failure")
        raise HTTPException(503, "Source deletion is pending. Retry removal to finish cleanup.", headers={"Retry-After": "2"}) from None
    return {"document_id": document_id, "notebook_id": notebook_id, "deleted": True}
