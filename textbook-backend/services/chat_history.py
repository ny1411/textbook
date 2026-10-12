"""Persist turns with short transactions, request deduplication, and fenced leases."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4, UUID
from fastapi import HTTPException

LEASE_SECONDS = 600


async def owned_notebook(db, notebook_id, user_id):
    notebook = await db.notebooks.find_first(where={"id": notebook_id, "userId": user_id})
    if not notebook:
        raise HTTPException(404, "Notebook not found.")
    return notebook


async def owned_conversation(db, conversation_id, user_id, notebook_id=None):
    where = {"id": conversation_id, "userId": user_id}
    if notebook_id:
        where["notebookId"] = notebook_id
    conversation = await db.conversations.find_first(where=where)
    if not conversation:
        raise HTTPException(404, "Conversation not found.")
    return conversation


def fingerprint(request, agent_mode):
    documents = request.document_ids if request.document_ids is not None else ([request.document_id] if request.document_id else None)
    data = {"query": request.query, "agent": agent_mode,
            "documents": sorted(set(documents)) if documents is not None else None,
            "top_k": request.top_k, "analysis": request.use_analysis}
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def serialize_citation(source):
    return {"source_id": source.sourceId, "document_id": source.originalDocumentId,
            "document_name": source.documentName, "source_unavailable": source.documentId is None,
            "page_number": source.pageNumber, "text": source.citationText or "",
            "chunk_id": source.chunkRef or "", "rerank_score": source.rerankScore}


def serialize_message(message):
    return {
        "id": message.id, "role": "user" if message.role == "USER" else "assistant",
        "content": message.message or "", "request_id": message.requestId,
        "sequence": message.sequence, "status": message.status,
        "query": message.query, "applied_query": message.appliedQuery,
        "intent": message.intent, "is_grounded": message.isGrounded, "warning": message.warning,
        "is_agent_mode": message.isAgentMode, "confidence_score": message.confidenceScore,
        "critique": message.critique, "iteration_count": message.iterationCount,
        "selected_document_ids": None if message.allDocuments else message.selectedDocumentIds,
        "top_k": message.topK, "use_analysis": message.useAnalysis,
        "created_at": message.createdAt.isoformat(),
        "citations": [serialize_citation(s) for s in sorted(message.sources or [], key=lambda s: s.position)],
    }


def saved_response(message):
    serialized = serialize_message(message)
    return {**{key: serialized[key] for key in (
        "query", "applied_query", "intent", "is_grounded", "warning", "confidence_score",
        "critique", "iteration_count", "citations")}, "answer": message.message or "",
        "conversation_id": message.conversationId, "message_id": message.id,
        "request_id": message.requestId}


async def begin_turn(db, request, user_id, agent_mode):
    """Lock the parent row to serialize allocation and allow one live turn per thread."""
    token = str(uuid4())
    now = datetime.now(timezone.utc)
    signature = fingerprint(request, agent_mode)
    async with db.tx() as tx:
        await tx.query_raw('SELECT id FROM conversations WHERE id = $1::uuid AND "userId" = $2::uuid FOR UPDATE',
                           request.conversation_id, user_id)
        conversation = await owned_conversation(tx, request.conversation_id, user_id, request.notebook_id)
        await owned_notebook(tx, conversation.notebookId, user_id)
        existing = await tx.conversationmessages.find_first(
            where={"conversationId": conversation.id, "requestId": request.request_id, "role": "LLM"},
            include={"sources": True},
        )
        if existing and existing.requestFingerprint != signature:
            raise HTTPException(409, "This request ID was already used for a different message.")
        if existing and existing.status == "COMPLETED":
            return existing, None, []
        pending = await tx.conversationmessages.find_many(
            where={"conversationId": conversation.id, "status": "PENDING"})
        for message in pending:
            expiry = message.leaseExpiresAt
            if expiry and expiry > now:
                raise HTTPException(409, "An answer is still being generated. Retry this turn shortly.")
            await tx.conversationmessages.update(where={"id": message.id}, data={"status": "FAILED"})
        if existing:
            # Retrying an earlier failure after subsequent turns would rewrite established history.
            if existing.sequence != conversation.nextSequence - 1:
                raise HTTPException(409, "Only the latest failed turn can be retried. Start a new message.")
            assistant = await tx.conversationmessages.update(where={"id": existing.id}, data={
                "status": "PENDING", "processingToken": token,
                "leaseExpiresAt": now + timedelta(seconds=LEASE_SECONDS),
            })
            user_sequence = existing.sequence - 1
        else:
            user_sequence = conversation.nextSequence
            common = {"conversationId": conversation.id, "requestId": request.request_id,
                      "isAgentMode": agent_mode, "selectedDocumentIds": request.document_ids or ([request.document_id] if request.document_id else []),
                      "allDocuments": request.document_ids is None and request.document_id is None,
                      "topK": request.top_k, "useAnalysis": request.use_analysis}
            await tx.conversationmessages.create(data={**common, "role": "USER", "message": request.query,
                                                       "sequence": user_sequence})
            assistant = await tx.conversationmessages.create(data={
                **common, "role": "LLM", "sequence": user_sequence + 1, "status": "PENDING",
                "query": request.query, "requestFingerprint": signature, "processingToken": token,
                "leaseExpiresAt": now + timedelta(seconds=LEASE_SECONDS),
            })
            await tx.conversations.update(where={"id": conversation.id},
                                          data={"nextSequence": user_sequence + 2})
        history = await tx.conversationmessages.find_many(
            where={"conversationId": conversation.id, "sequence": {"lt": user_sequence},
                   "status": "COMPLETED", "OR": [{"role": "USER"}, {"role": "LLM"}]},
            order={"sequence": "desc"}, take=20,
        )
        # Exclude questions whose answers failed or are still pending.
        completed_turns = {m.requestId for m in history if m.role == "LLM"}
        context = [{"role": "user" if m.role == "USER" else "assistant", "content": (m.message or "")[:8000]}
                   for m in reversed(history) if (m.requestId in completed_turns or m.requestFingerprint == "legacy") and m.message]
        return assistant, token, context


async def complete_turn(db, assistant, token, response, user_id, notebook_id):
    async with db.tx() as tx:
        await tx.query_raw('SELECT id FROM conversations WHERE id = $1::uuid AND "userId" = $2::uuid FOR UPDATE',
                           assistant.conversationId, user_id)
        await owned_conversation(tx, assistant.conversationId, user_id, notebook_id)
        current = await tx.conversationmessages.find_unique(where={"id": assistant.id})
        if not current or current.processingToken != token or current.status != "PENDING":
            raise HTTPException(409, "This attempt was superseded. Reload the conversation.")
        document_ids = []
        for citation in response.citations:
            try:
                document_ids.append(str(UUID(citation.document_id)))
            except (ValueError, TypeError, AttributeError):
                pass
        documents = await tx.uploadeddocuments.find_many(where={"userId": user_id, "notebookId": notebook_id,
                                                               "id": {"in": document_ids}}) if document_ids else []
        documents = {d.id: d for d in documents}
        source_rows = []
        for position, citation in enumerate(response.citations):
            document = documents.get(citation.document_id)
            source_rows.append({
                "messageId": assistant.id, "documentId": document.id if document else None,
                "originalDocumentId": citation.document_id, "documentName": document.name if document else citation.document_name,
                "sourceId": str(citation.source_id), "position": position,
                "pageNumber": citation.page_number, "chunkRef": citation.chunk_id,
                "citationText": citation.text, "rerankScore": citation.rerank_score,
            })
        if source_rows:
            await tx.messagesources.create_many(data=source_rows)
        saved = await tx.conversationmessages.update(where={"id": assistant.id}, data={
            "message": response.answer, "appliedQuery": response.applied_query, "intent": response.intent,
            "isGrounded": response.is_grounded, "warning": response.warning, "status": "COMPLETED",
            "confidenceScore": getattr(response, "confidence_score", None),
            "critique": getattr(response, "critique", None), "iterationCount": getattr(response, "iteration_count", None),
            "processingToken": None, "leaseExpiresAt": None,
        }, include={"sources": True})
        conversation = await tx.conversations.find_unique(where={"id": assistant.conversationId})
        update = {"updatedAt": datetime.now(timezone.utc)}
        if not conversation.titleIsManual and not conversation.titleGenerated:
            update["title"] = " ".join(response.query.split())[:80]
        await tx.conversations.update(where={"id": assistant.conversationId}, data=update)
        return saved


async def fail_turn(db, assistant, token):
    await db.conversationmessages.update_many(
        where={"id": assistant.id, "processingToken": token, "status": "PENDING"},
        data={"status": "FAILED", "processingToken": None, "leaseExpiresAt": None},
    )
