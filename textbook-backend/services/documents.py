from services.chat_history import own_notebook, timestamp
from fastapi import HTTPException

STATUS = {"UPLOADED": "processing", "PROCESSING": "processing", "COMPLETED": "ready", "FAILED": "failed"}


async def own_document(db, user_id, document_id):
    rows = await db.query('SELECT d.*, EXISTS (SELECT 1 FROM document_deletions x WHERE x."documentId" = d.id) AS "deletionPending" '
        'FROM uploaded_documents d JOIN notebooks n ON n.id = d."notebookId" '
        'AND n."userId" = d."userId" WHERE d.id = %s::uuid AND d."userId" = %s::uuid', document_id, user_id)
    if not rows:
        raise HTTPException(404, "Source not found")
    return rows[0]


async def list_documents(db, user_id, notebook_id, limit, offset):
    await own_notebook(db, user_id, notebook_id)
    rows = await db.query('SELECT d.*, EXISTS (SELECT 1 FROM document_deletions x WHERE x."documentId" = d.id) AS "deletionPending" '
        'FROM uploaded_documents d WHERE "userId" = %s::uuid AND "notebookId" = %s::uuid '
        'ORDER BY "createdAt" DESC, id DESC LIMIT %s OFFSET %s', user_id, notebook_id, limit + 1, offset)
    return {"items": [{"userId": user_id, "filename": row["name"] or "Document", "filepath": row["storageUrl"],
        "documentId": str(row["id"]), "notebookId": notebook_id, "status": "failed" if row["deletionPending"] else STATUS[row["status"]],
        "deletionPending": row["deletionPending"],
        "size": int(row["fileSize"] or 0), "type": row["fileType"], "uploadedAt": timestamp(row["createdAt"]),
        "pageCount": row["pageCount"]} for row in rows[:limit]], "next_offset": offset + limit if len(rows) > limit else None}


async def lock_document(tx, document_id):
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", "document:" + document_id)


async def record_upload(db, user_id, notebook_id, document_id, filename, size, content_type, path):
    await own_notebook(db, user_id, notebook_id)
    await db.execute('INSERT INTO uploaded_documents (id, "userId", "notebookId", name, "fileSize", "fileType", "storageUrl", status, "updatedAt") '
        'VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, \'PROCESSING\', NOW())',
        document_id, user_id, notebook_id, filename, str(size), content_type, path)


async def finish_ingestion(db, user_id, document_id, success):
    await db.execute('UPDATE uploaded_documents SET status = %s::"STATUS", "updatedAt" = NOW() '
        'WHERE id = %s::uuid AND "userId" = %s::uuid', "COMPLETED" if success else "FAILED", document_id, user_id)
