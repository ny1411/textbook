"""Owned notebook threads and atomic, retry-safe completed chat turns."""
import hashlib
import json
from datetime import timezone
from uuid import uuid4

from fastapi import HTTPException
from psycopg.types.json import Jsonb
from services.conversation_titles import conversation_title


def identifier(value):
    return str(value)


def timestamp(value):
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()


def notebook_item(row):
    return {"id": identifier(row["id"]), "name": row["name"] or "Research notebook"}


def thread_item(row):
    return {"id": identifier(row["id"]), "notebook_id": identifier(row["notebookId"]),
            "title": row["title"] or "New chat", "updated_at": timestamp(row["updatedAt"])}


async def notebooks(db, user):
    async with db.transaction() as tx:
        # Serialize first-login bootstrap across tabs; reuse existing notebooks.
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", user.id)
        await tx.execute('INSERT INTO users (id, email, name, "updatedAt") VALUES (%s::uuid, %s, %s, NOW()) '
            'ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, "updatedAt" = NOW()',
            user.id, user.email, user.name)
        rows = await tx.query('SELECT * FROM notebooks WHERE "userId" = %s::uuid ORDER BY "createdAt", id LIMIT 100', user.id)
        if not rows:
            rows = await tx.query('INSERT INTO notebooks (id, "userId", name, "updatedAt") '
                'VALUES (%s::uuid, %s::uuid, %s, NOW()) RETURNING *', str(uuid4()), user.id, "Research notebook")
    return [notebook_item(row) for row in rows]


async def own_notebook(db, user_id, notebook_id):
    rows = await db.query('SELECT id FROM notebooks WHERE id = %s::uuid AND "userId" = %s::uuid', notebook_id, user_id)
    if not rows:
        raise HTTPException(404, "Notebook not found")


async def own_conversation(db, user_id, conversation_id, notebook_id=None):
    rows = await db.query('SELECT c.* FROM conversations c JOIN notebooks n ON n.id = c."notebookId" AND n."userId" = c."userId" '
        'WHERE c.id = %s::uuid AND c."userId" = %s::uuid', conversation_id, user_id)
    if not rows or (notebook_id is not None and str(rows[0]["notebookId"]) != notebook_id):
        raise HTTPException(404, "Conversation not found")
    return rows[0]


async def create_conversation(db, user_id, notebook_id, conversation_id=None):
    await own_notebook(db, user_id, notebook_id)
    conversation_id = conversation_id or str(uuid4())
    await db.execute('INSERT INTO conversations (id, "userId", "notebookId", title, "updatedAt") '
        'VALUES (%s::uuid, %s::uuid, %s::uuid, %s, NOW()) ON CONFLICT (id) DO NOTHING',
        conversation_id, user_id, notebook_id, "New chat")
    return await own_conversation(db, user_id, conversation_id, notebook_id)


async def list_conversations(db, user_id, notebook_id, limit=50, offset=0):
    await own_notebook(db, user_id, notebook_id)
    rows = await db.query('SELECT * FROM conversations WHERE "userId" = %s::uuid AND "notebookId" = %s::uuid '
        'ORDER BY "updatedAt" DESC, id DESC LIMIT %s OFFSET %s', user_id, notebook_id, limit + 1, offset)
    return {"items": [thread_item(row) for row in rows[:limit]], "next_offset": offset + limit if len(rows) > limit else None}


async def messages(db, user_id, conversation_id, limit=100, before=None):
    conversation = await own_conversation(db, user_id, conversation_id)
    rows = await db.query('SELECT * FROM conversation_messages WHERE "conversationId" = %s::uuid '
        'AND (%s::int IS NULL OR sequence < %s::int) ORDER BY sequence DESC LIMIT %s',
        conversation_id, before, before, limit + 1)
    selected = rows[:limit]
    legacy_ids = [str(row["id"]) for row in selected if row["role"] == "LLM" and not row["metadata"]]
    legacy = {}
    if legacy_ids:
        sources = await db.query('SELECT s.* FROM message_sources s JOIN uploaded_documents d ON d.id = s."documentId" '
            'WHERE s."messageId" = ANY(%s::uuid[]) AND d."userId" = %s::uuid AND d."notebookId" = %s::uuid ORDER BY s."sourceId"',
            legacy_ids, user_id, str(conversation["notebookId"]))
        for source in sources:
            legacy.setdefault(str(source["messageId"]), []).append({"source_id": source["sourceId"],
                "document_id": str(source["documentId"]), "page_number": source["pageNumber"],
                "chunk_id": source["chunkRef"] or "", "text": source["citationText"] or "", "rerank_score": None})
    return {"items": [{"id": str(row["id"]), "role": "user" if row["role"] == "USER" else "assistant",
        "content": row["message"] or "", "created_at": timestamp(row["createdAt"]),
        "attachments": (row["metadata"] or {}).get("attachments", []) if row["role"] == "USER" else [],
        "response": (row["metadata"] or {}).get("response") or (
            {"query": "", "answer": row["message"] or "", "applied_query": "", "citations": legacy[str(row["id"])]}
            if str(row["id"]) in legacy else None),
        "is_agent_mode": (row["metadata"] or {}).get("pipeline") == "agent"} for row in reversed(selected)],
        "next_before": selected[-1]["sequence"] if len(rows) > limit else None}


async def canonical_history(db, conversation_id):
    rows = await db.query('SELECT role, message, metadata FROM conversation_messages WHERE "conversationId" = %s::uuid '
        'AND role IN (\'USER\', \'LLM\') ORDER BY sequence DESC LIMIT 20', conversation_id)
    history = []
    for row in reversed(rows):
        content = row["message"] or ""
        observations = (row["metadata"] or {}).get("image_observations", []) if row["role"] == "USER" else []
        if observations:
            attachments = (row["metadata"] or {}).get("attachments", [])
            content += "\nHistorical image observations (visual evidence, not textbook citations):\n" + "\n".join(
                f'Historical attachment {attachments[index - 1]["id"] if index <= len(attachments) else index}: {text}'
                for index, text in enumerate(observations, 1))
        if content:
            history.append({"role": "user" if row["role"] == "USER" else "assistant", "content": content[:8000]})
    return history


async def resolve_documents(db, user_id, notebook_id, requested):
    rows = await db.query('SELECT id FROM uploaded_documents WHERE "userId" = %s::uuid AND "notebookId" = %s::uuid',
        user_id, notebook_id)
    owned = {str(row["id"]) for row in rows}
    if requested is None:
        return sorted(owned)
    if not set(requested).issubset(owned):
        raise HTTPException(404, "Source not found in this notebook")
    return list(dict.fromkeys(requested))


def request_hash(request, pipeline):
    data = {key: getattr(request, key) for key in ("query", "top_k", "use_analysis", "document_ids", "document_id")}
    data["pipeline"] = pipeline
    # Attachment order matters to prompts such as 'compare the first two images'.
    attachments = list(getattr(request, "attachment_ids", []))
    if attachments:
        data["attachment_ids"] = attachments
    # Normalize selection order, while retaining explicit empty vs all-sources.
    if data["document_ids"] is not None:
        data["document_ids"] = sorted(set(data["document_ids"]))
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


async def replay(db, conversation_id, request_id, fingerprint):
    rows = await db.query('SELECT metadata FROM conversation_messages WHERE "conversationId" = %s::uuid '
        'AND "requestId" = %s::uuid AND role = \'LLM\'', conversation_id, request_id)
    if not rows:
        return None
    metadata = rows[0]["metadata"] or {}
    if metadata.get("request_hash") != fingerprint:
        raise HTTPException(409, "This request ID was already used for another message")
    return metadata["response"]


async def save_turn(db, user_id, conversation, request, payload, pipeline, fingerprint):
    conversation_id = str(conversation["id"])
    async with db.transaction() as tx:
        # No DB lock is held during model inference. This short compare-and-swap
        # serializes completed turns and rejects stale concurrent context.
        updated = await tx.query('UPDATE conversations SET version = version + 1, "updatedAt" = NOW(), '
            'title = CASE WHEN version = 0 THEN %s ELSE title END '
            'WHERE id = %s::uuid AND "userId" = %s::uuid AND version = %s RETURNING *',
            conversation_title(request.query or ("Image discussion" if getattr(request, "attachment_ids", []) else "")), conversation_id, user_id, conversation["version"])
        if not updated:
            repeated = await replay(tx, conversation_id, request.request_id, fingerprint)
            if repeated:
                return repeated
            raise HTTPException(409, "This conversation changed while answering. Retry your message.")
        user_message_id, message_id = str(uuid4()), str(uuid4())
        response = {**payload, "conversation_id": conversation_id, "message_id": message_id,
            "user_message_id": user_message_id, "request_id": request.request_id,
            "conversation_title": updated[0]["title"]}
        sequence = conversation["version"] * 2
        for role, content, mid, position, meta in (
            ("USER", request.query, user_message_id, sequence, {"pipeline": pipeline,
                "attachments": payload.get("attachments", []),
                "image_observations": getattr(request, "_current_observations", [])}),
            ("LLM", payload["answer"], message_id, sequence + 1,
             {"pipeline": pipeline, "request_hash": fingerprint, "response": response}),
        ):
            await tx.execute('INSERT INTO conversation_messages (id, "conversationId", role, message, sequence, "requestId", metadata) '
                'VALUES (%s::uuid, %s::uuid, %s::"MESSAGEROLES", %s, %s, %s::uuid, %s)',
                mid, conversation_id, role, content, position, request.request_id, Jsonb(meta))
        if getattr(request, "attachment_ids", []):
            from services.chat_attachments import attach_to_message
            await attach_to_message(tx, user_id, conversation, request.attachment_ids, user_message_id)
        for citation in payload.get("citations", []):
            allowed = await tx.query('SELECT id FROM uploaded_documents WHERE id = %s::uuid AND "userId" = %s::uuid AND "notebookId" = %s::uuid',
                citation.get("document_id"), user_id, str(conversation["notebookId"]))
            if not allowed:
                raise HTTPException(502, "The answer referenced an unavailable source; please retry")
            await tx.execute('INSERT INTO message_sources (id, "messageId", "documentId", "sourceId", "pageNumber", "chunkRef", "citationText") '
                'VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s)', str(uuid4()), message_id,
                citation["document_id"], str(citation["source_id"]), citation.get("page_number"), citation.get("chunk_id"), citation["text"])
            await tx.execute('INSERT INTO conversation_documents ("conversationId", "documentId", "updatedAt") VALUES (%s::uuid, %s::uuid, NOW()) '
                'ON CONFLICT DO NOTHING', conversation_id, citation["document_id"])
        return response
