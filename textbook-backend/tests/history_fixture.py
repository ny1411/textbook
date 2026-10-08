"""Local-only SQL/API fixture. Auth, ML, Storage, Redis and telemetry are synthetic."""
import asyncio
import base64
import importlib
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from types import ModuleType, SimpleNamespace

import psycopg
from fastapi import FastAPI, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from supabase_auth.errors import AuthApiError

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "textbook-backend"
sys.path.insert(0, str(BACKEND))
USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
DSN = "host=127.0.0.1 port=55419 dbname=postgres user=postgres sslmode=disable connect_timeout=5"


def token(user_id):
    encode = lambda data: base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    return f'{encode({"alg": "HS256", "typ": "JWT"})}.{encode({"sub": user_id, "exp": 4102444800, "role": "authenticated", "aud": "authenticated"})}.fixture'


TOKENS = {token(user): user for user in (USER_A, USER_B)}
EVENTS, CACHE, OBJECTS, POINTS = [], {}, {}, []


def module(name, **attributes):
    value = ModuleType(name)
    value.__dict__.update(attributes)
    sys.modules[name] = value
    return value


def profile(user_id):
    return {"id": user_id, "email": f"{user_id}@example.invalid", "aud": "authenticated", "role": "authenticated",
        "created_at": "2026-01-01T00:00:00Z", "app_metadata": {}, "user_metadata": {"full_name": "Researcher " + ("A" if user_id == USER_A else "B")}}


def verify(access_token):
    if access_token not in TOKENS:
        raise AuthApiError("Invalid fixture token", 401, "bad_jwt")
    return SimpleNamespace(user=SimpleNamespace(**profile(TOKENS[access_token])))


class Storage:
    def get_bucket(self, bucket):
        return SimpleNamespace(public=False)
    def from_(self, bucket):
        return self
    def upload(self, path, data, options):
        OBJECTS[path] = data
        return {"path": path}
    def remove(self, paths):
        for path in paths:
            OBJECTS.pop(path, None)
    def download(self, path):
        return OBJECTS[path]


VISION_EVENTS = []


class VisionModel:
    def __init__(self, schema=None):
        self.schema = schema
    def with_structured_output(self, schema):
        return VisionModel(schema)
    def invoke(self, messages, config=None):
        blocks = messages[-1].content
        text = blocks[0]["text"]
        image_inputs = [block for block in blocks if block["type"] == "image_url"]
        VISION_EVENTS.append({"stage": self.schema.__name__ if self.schema else "answer",
            "messages": messages, "images": image_inputs, "config": config})
        if self.schema and self.schema.__name__ == "ImageAnalysis":
            return self.schema(observations=["visible fixture graph with labelled axes" for _ in image_inputs],
                search_query="Explain visible fixture graph" if text == "Explain the attached image(s)." else text)
        if "fail-generation" in text:
            raise RuntimeError("Synthetic vision generation failure")
        if self.schema:
            return self.schema(is_grounded=True, confidence_score=88, critique="Image and textbook claims are labelled separately")
        return SimpleNamespace(content="The visible fixture graph has labelled axes [Image 1]." +
            (" This relates to the chapter [Source 1][Source 2]." if "[Source 1]" in text else ""))


class Vectors:
    def delete(self, *, collection_name, points_selector, wait):
        assert collection_name == "textbook_chunks" and wait is True
        values = {condition.key: condition.match.value for condition in points_selector.filter.must}
        assert set(values) == {"document_id", "user_id"}
        POINTS[:] = [point for point in POINTS if not all(point.get(key) == value for key, value in values.items())]


def ingest(**kwargs):
    if kwargs["filename"] == "bad.pdf":
        return False
    POINTS.append({key: kwargs[key] for key in ("user_id", "document_id", "notebook_id")})
    return True


def invalidate(user_id, *, strict=False):
    for key in list(CACHE):
        if json.loads(key).get("user_id") == user_id:
            CACHE.pop(key)


def analyze(query, config=None, history=None):
    EVENTS.append({"query": query, "history": history})
    return SimpleNamespace(intent="casual_chat" if query == "hi" else "textbook_rag", rewritten_query=query, sub_queries=[])


def retrieve(**kwargs):
    return [{"id": f"chunk-{page}", "rerank_score": .8, "payload": {"document_id": kwargs["document_ids"][0],
        "page_number": page, "text": f"Verified fixture passage {page}"}} for page in (1, 2)] if kwargs["document_ids"] else []


def generate(query, chunks, config=None):
    if query == "fail-generation":
        raise RuntimeError("Synthetic generation failure")
    citations = [{"source_id": index, "document_id": chunk["payload"]["document_id"], "page_number": chunk["payload"]["page_number"],
        "text": chunk["payload"]["text"], "chunk_id": chunk["id"], "rerank_score": 0.0 if index == 1 else .8}
        for index, chunk in enumerate(chunks, 1)]
    return {"answer": f"Saved answer to {query} [Source 1][Source 2]", "citations": citations}


def conversational(query, intent, history=None, config=None):
    return {"answer": f"Conversational answer to {query}", "citations": [], "intent": intent, "is_grounded": False,
        "warning": "Answered using general AI knowledge; not found in your uploaded documents" if intent == "general_knowledge" else None}


def agent(state, config=None):
    if state.get("images"):
        from services.vision import generate_visual_answer
        return {**generate_visual_answer(state.get("rewritten_query") or state["query"], state["images"],
            state.get("image_observations", []), state.get("history"), config, chunks=retrieve(**state)),
            "confidence_score": 88, "critique": "Image and textbook claims are labelled separately", "iteration_count": 1}
    return {**generate(state["query"], retrieve(**state)), "confidence_score": 64, "is_grounded": True,
        "critique": "Supported by the selected sources", "iteration_count": 2, "intent": "textbook_rag"}


def cache_key(kwargs):
    return json.dumps(kwargs, sort_keys=True)


def cache_set(response, **kwargs):
    CACHE[cache_key(kwargs)] = response.model_dump()


def build_app(db=None):
    # Avoid model downloads/remote I/O, but run the actual request models, auth
    # dependency, both pipeline routers, ownership checks and SQL transactions.
    routers = module("routers")
    routers.__path__ = [str(BACKEND / "routers")]
    module("db.supabase", supabase_client=SimpleNamespace(auth=SimpleNamespace(get_user=verify), storage=Storage()))
    module("db.qdrant", client=Vectors())
    module("services.analyzer", analyze_query=analyze)
    module("services.retriever", hybrid_search=retrieve)
    module("services.reranker", reranker_with_cross_encoder=lambda query, candidate_chunks, top_k: candidate_chunks[:top_k])
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("fixture_generator", BACKEND / "services/generator.py")
    formatter = module_from_spec(spec)
    spec.loader.exec_module(formatter)
    module("services.generator", generate_answer=generate,
        format_context_with_citations=formatter.format_context_with_citations,
        order_context_nodes=formatter.order_context_nodes)
    from services.relevance import relevant_chunks
    module("services.conversation", generate_conversational_answer=conversational, relevant_chunks=relevant_chunks)
    module("services.ingestion", process_and_ingest=ingest)
    module("services.status", is_user_ingesting=lambda **kwargs: False, set_document_status=lambda **kwargs: None,
        clear_document_status=lambda *args: None)
    module("services.caching", get_cached_response=lambda **kwargs: CACHE.get(cache_key(kwargs)), set_cached_response=cache_set,
        invalidate_user_cache=invalidate)
    module("core.telemetry", create_langfuse_config=lambda **kwargs: {})
    module("agents.graph", graph=SimpleNamespace(invoke=agent))
    module("agents.state", AgentState=dict)
    module("core.llm", get_llm=lambda **kwargs: VisionModel())
    # Fixtures may run after tests have already imported vision. Replace its
    # provider binding explicitly to avoid accidental real image/provider I/O.
    vision = importlib.import_module("services.vision")
    vision.get_llm = lambda **kwargs: VisionModel()
    app = FastAPI()
    app.state.db = db
    app.state.lock = asyncio.Lock()
    for name in ("conversations", "chat", "chat_attachments", "documents", "upload", "search"):
        app.include_router(importlib.import_module(f"routers.{name}").router, prefix="/api")
    from db.postgres import get_db
    async def local_db():
        async with app.state.lock:
            yield app.state.db
    app.dependency_overrides[get_db] = local_db
    from core.auth import require_user
    @app.post("/fixture/notebooks")
    async def fixture_notebook(user=Depends(require_user), db=Depends(get_db)):
        from uuid import uuid4
        from services.chat_history import own_notebook, notebooks
        await notebooks(db, user)
        notebook_id = str(uuid4())
        await db.execute('INSERT INTO notebooks (id, "userId", name, "updatedAt") VALUES (%s::uuid, %s::uuid, %s, NOW())',
            notebook_id, user.id, "Second fixture notebook")
        await own_notebook(db, user.id, notebook_id)
        return {"id": notebook_id}
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3119"], allow_methods=["*"], allow_headers=["*"])
    @app.get("/auth/v1/user")
    def auth_user(authorization: str = Header("")):
        return profile(verify(authorization.removeprefix("Bearer ")).user.id)
    @app.post("/auth/v1/logout", status_code=204)
    def logout():
        return None
    return app


@asynccontextmanager
async def database(legacy=None):
    from uuid import uuid4
    from db.postgres import Session
    schema = "history_test_" + uuid4().hex
    async with await psycopg.AsyncConnection.connect(DSN, autocommit=True) as connection:
        await connection.execute(f'CREATE SCHEMA "{schema}"')
        await connection.execute(f'SET search_path TO "{schema}"')
        session = Session(connection)
        try:
            await connection.execute((ROOT / "verification/issue-19/baseline.sql").read_text())
            await connection.execute((BACKEND / "prisma/changes/issue-20-chat-images.sql").read_text())
            if legacy:
                await legacy(session)
            await connection.execute((BACKEND / "prisma/changes/issue-19-history.sql").read_text())
            await connection.execute((BACKEND / "prisma/changes/issue-18-document-deletion.sql").read_text())
            yield session
        finally:
            await connection.rollback()
            await connection.execute(f'DROP SCHEMA "{schema}" CASCADE')


if __name__ == "__main__":
    import uvicorn
    app = build_app()
    @asynccontextmanager
    async def lifespan(application):
        async with database() as db:
            application.state.db = db
            yield
    app.router.lifespan_context = lifespan
    uvicorn.run(app, host="127.0.0.1", port=8199, log_level="warning")
