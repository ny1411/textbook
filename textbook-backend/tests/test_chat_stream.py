"""Actual SQL/routes/LangGraph with synthetic provider token iterators.

Start verification/issue-19/postgres.mjs before running, like the history suite.
The optional STREAM_TEST_SQL_PORT selects an independent local SQL fixture.
"""
import asyncio
import importlib.util
import json
import os
import socket
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest
import uvicorn
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.runnables import Runnable

import history_fixture as fixture
from test_chat_history import setup, body, closing
from test_image_chat import upload_image


def load_source(name, relative):
    spec = importlib.util.spec_from_file_location(name, fixture.BACKEND / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Provider(Runnable):
    """Invoke returns private drafts; stream yields independently arriving text."""
    def __init__(self, controls, schema=None):
        self.controls, self.schema = controls, schema

    def with_structured_output(self, schema):
        return Provider(self.controls, schema)

    def invoke(self, inputs, config=None, **kwargs):
        if self.schema:
            if self.schema.__name__ == "ImageAnalysis":
                images = [block for block in inputs[-1].content if block["type"] == "image_url"]
                return self.schema(observations=["visible graph" for _ in images], search_query="Explain the graph")
            self.controls["reflections"] += 1
            if self.controls.get("reflection_error") and self.controls["reflections"] >= 3:
                raise RuntimeError("synthetic final reflection failure")
            return self.schema(is_grounded=self.controls["reflections"] > 1 or self.controls.get("accept_first", False),
                confidence_score=91, critique="Final answer was checked")
        self.controls["drafts"] += 1
        return AIMessage(content="PRIVATE discarded draft [Source 1].")

    def stream(self, inputs, config=None, **kwargs):
        self.controls["streams"] += 1
        try:
            if self.controls.get("empty_answer"):
                yield AIMessageChunk(content=[])
                return
            for index, delta in enumerate(("Final ", "streamed ", "answer ", "[Source 1][Source 2].")):
                time.sleep(self.controls.get("token_delay", .01))
                if self.controls.get("generation_error") and index == 1:
                    raise RuntimeError("synthetic provider failure")
                yield AIMessageChunk(content=delta)
        finally:
            self.controls["closed"] += 1


def install_streaming(monkeypatch, *, delay=0):
    """Use real generators and graph; keep auth/storage/retrieval synthetic."""
    core_llm = __import__("importlib").import_module("core.llm")
    import routers.chat as chat
    controls = {"drafts": 0, "reflections": 0, "streams": 0, "closed": 0}
    provider = lambda **kwargs: Provider(controls)
    monkeypatch.setattr(core_llm, "get_llm", provider)
    generator = load_source("stream_test_generator", "services/generator.py")
    conversation = load_source("stream_test_conversation", "services/conversation.py")
    monkeypatch.setattr(chat, "generate_answer", generator.generate_answer)
    monkeypatch.setattr(chat, "generate_conversational_answer", conversation.generate_conversational_answer)
    import services.vision as vision
    monkeypatch.setattr(vision, "vision_llm", provider)
    # The normal SQL fixture substitutes these modules. Reload the actual graph
    # with real node functions so retries/reflection are exercised in this test.
    analyzer_module = __import__("importlib").import_module("services.analyzer")
    monkeypatch.setattr(analyzer_module, "QueryAnalysis", SimpleNamespace, raising=False)
    import agents.nodes as nodes
    state_module = __import__("importlib").import_module("agents.state")
    real_state = load_source("stream_test_state", "agents/state.py")
    monkeypatch.setattr(state_module, "AgentState", real_state.AgentState)
    monkeypatch.setattr(nodes, "generate_answer", generator.generate_answer)
    monkeypatch.setattr(nodes, "generate_conversational_answer", conversation.generate_conversational_answer)
    monkeypatch.setattr(nodes, "vision_llm", provider)
    monkeypatch.setattr(nodes, "evaluator_chain", nodes.reflector_prompt | provider().with_structured_output(nodes.ReflectionGrade))
    real_graph = load_source("agents.stream_test_graph", "agents/graph.py")
    monkeypatch.setattr(chat, "graph", real_graph.graph)
    def retrieve(**kwargs):
        time.sleep(controls.get("retrieval_delay", delay))
        return fixture.retrieve(**kwargs)
    monkeypatch.setattr(chat, "hybrid_search", retrieve)
    monkeypatch.setattr(nodes, "hybrid_search", retrieve)
    return controls


def parse_events(text):
    result = []
    for block in text.split("\n\n"):
        lines = block.splitlines()
        name = next((line[7:] for line in lines if line.startswith("event: ")), None)
        data = next((line[6:] for line in lines if line.startswith("data: ")), None)
        if name and data:
            result.append((name, json.loads(data)))
    return result


@pytest.mark.parametrize("content", ["", " \n\t", [{"type": "reasoning", "text": "private reasoning"}]])
def test_blank_or_nonanswer_model_output_is_rejected_for_json_and_stream(content):
    from services.chat_stream import model_answer
    response = SimpleNamespace(content=content)
    model = SimpleNamespace(invoke=lambda *args, **kwargs: response,
        stream=lambda *args, **kwargs: iter([response]))
    with pytest.raises(ValueError, match="no answer text"):
        model_answer(model, [])
    with pytest.raises(ValueError, match="no answer text"):
        model_answer(model, [], emit=lambda *args: None)


@pytest.fixture(autouse=True)
def providers(monkeypatch):
    fixture.CACHE.clear(); fixture.EVENTS.clear(); fixture.OBJECTS.clear(); fixture.POINTS.clear()
    monkeypatch.setattr(fixture, "DSN", fixture.DSN.replace("55419", os.environ.get("STREAM_TEST_SQL_PORT", "55419")))
    # Avoid a production SDK import while history_fixture installs provider seams.
    if "core.llm" not in __import__("sys").modules:
        fixture.module("core.llm", get_llm=lambda **kwargs: fixture.VisionModel())


@pytest.mark.parametrize("route", ["/api/chat", "/api/agent/chat"])
def test_arriving_tokens_citations_persistence_replay_and_json(monkeypatch, route):
    async def check():
        async with fixture.database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                controls = install_streaming(monkeypatch)
                payload = body(notebook, thread)
                response = await client.post(route, json=payload, headers={"Accept": "text/event-stream"})
                assert response.status_code == 200, response.text
                assert response.headers["content-type"].startswith("text/event-stream")
                events = parse_events(response.text)
                assert events[0] == ("status", {"stage": "accepted"})
                tokens = [data["delta"] for event, data in events if event == "token"]
                assert tokens == ["Final ", "streamed ", "answer ", "[Source 1][Source 2]."]
                assert "PRIVATE" not in response.text
                assert next(index for index, (name, _) in enumerate(events) if name == "citations") < next(index for index, (name, _) in enumerate(events) if name == "token")
                saved = events[-1][1]
                assert events[-1][0] == "done" and saved["answer"] == "".join(tokens)
                page = (await client.get(f"/api/conversations/{thread}/messages")).json()
                assert page["items"][-1]["response"] == saved
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
                if route.endswith("agent/chat"):
                    assert controls["drafts"] == 2 and controls["reflections"] == 3
                    assert saved["confidence_score"] == 91 and saved["iteration_count"] == 2
                before = controls.copy()
                repeated = parse_events((await client.post(route, json=payload, headers={"Accept": "text/event-stream"})).text)
                assert repeated[-1] == ("done", saved) and controls == before
                assert repeated[1][1]["is_grounded"] == saved["is_grounded"]
                assert (await client.post(route, json=payload)).json() == saved
                assert (await client.post(route, json={**payload, "query": "changed"}, headers={"Accept": "text/event-stream"})).status_code == 409
    asyncio.run(check())


@pytest.mark.parametrize("route", ["/api/chat", "/api/agent/chat"])
def test_casual_and_no_sources_stream_without_document_citations(monkeypatch, route):
    async def check():
        async with fixture.database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                install_streaming(monkeypatch)
                for query, intent in (("hi", "casual_chat"), ("No sources", "general_knowledge")):
                    events = parse_events((await client.post(route, json=body(notebook, thread, query, document_ids=[]), headers={"Accept": "text/event-stream"})).text)
                    final = events[-1][1]
                    assert events[-1][0] == "done", events
                    assert final["intent"] == intent and final["citations"] == [] and final["is_grounded"] is False
                    assert bool(final["warning"]) == (intent == "general_knowledge")
    asyncio.run(check())


@pytest.mark.parametrize("failure", ["generation_error", "reflection_error", "empty_answer"])
def test_stream_errors_never_persist_partial_answers(monkeypatch, failure):
    async def check():
        async with fixture.database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                controls = install_streaming(monkeypatch)
                controls[failure] = True
                response = await client.post("/api/agent/chat", json=body(notebook, thread), headers={"Accept": "text/event-stream"})
                events = parse_events(response.text)
                assert events[-1] == ("error", {"message": "Could not generate an answer; retry your message", "status": 500})
                assert not await db.query('SELECT id FROM conversation_messages')
                assert not fixture.CACHE
                assert controls["closed"] == 1
    asyncio.run(check())


@pytest.mark.parametrize("route", ["/api/chat", "/api/agent/chat"])
def test_images_stream_and_exact_retry_does_not_reobserve_or_reattach(monkeypatch, route):
    async def check():
        async with fixture.database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                attachment = (await upload_image(client, thread)).json()
                controls = install_streaming(monkeypatch)
                payload = body(notebook, thread, "", attachment_ids=[attachment["id"]])
                events = parse_events((await client.post(route, json=payload, headers={"Accept": "text/event-stream"})).text)
                assert events[-1][0] == "done", events
                saved = events[-1][1]
                assert saved["attachments"] == [attachment] and saved["image_observations"] == ["visible graph"]
                before = controls.copy()
                retry = parse_events((await client.post(route, json=payload, headers={"Accept": "text/event-stream"})).text)
                assert retry[-1][1] == saved and controls == before
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
    asyncio.run(check())


@asynccontextmanager
async def serving(app):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", lifespan="off"))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    while not server.started:
        if task.done():
            await task
        await asyncio.sleep(.01)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await task


@pytest.mark.parametrize("route", ["/api/chat", "/api/agent/chat"])
def test_network_progress_heartbeat_and_disconnect_leave_no_turn(monkeypatch, route):
    async def check():
        import services.chat_stream as transport
        monkeypatch.setattr(transport, "HEARTBEAT_SECONDS", .08)
        async with fixture.database() as db:
            client, notebook, thread, _ = await setup(db)
            app = client._transport.app
            async with closing(client), serving(app) as url:
                controls = install_streaming(monkeypatch, delay=.35)
                controls["token_delay"] = .05
                async with httpx.AsyncClient(base_url=url, trust_env=False, headers={"Authorization": "Bearer " + fixture.token(fixture.USER_A)}) as network:
                    started = time.monotonic()
                    async with network.stream("POST", route, json=body(notebook, thread), headers={"Accept": "text/event-stream"}) as response:
                        lines = response.aiter_lines()
                        first = await anext(lines)
                        assert first == "event: status" and time.monotonic() - started < .25
                        saw_heartbeat = False
                        async for line in lines:
                            saw_heartbeat |= line == ": heartbeat"
                            if line == "event: token":
                                break
                        assert saw_heartbeat
                    await asyncio.sleep(.2)
                    page = await network.get(f"/api/conversations/{thread}/messages")
                    assert page.json()["items"] == []
                    assert not fixture.CACHE
                    assert controls["closed"] == 1
    asyncio.run(check())
