"""Exercise the real image decoder and actual model message content without providers."""
import base64
import importlib.util
import sys
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image

from history_fixture import BACKEND, build_app, Storage


def encoded_image(color="white", size=(24, 20)):
    output = BytesIO()
    Image.new("RGB", size, color=color).save(output, format="PNG")
    return output.getvalue()


def providers(monkeypatch):
    # The API fixture deliberately replaces model/storage providers only. Keep
    # the real prompt formatting here even if an earlier API test used its stub.
    build_app()
    spec = importlib.util.spec_from_file_location("_image_test_generator", BACKEND / "services/generator.py")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    monkeypatch.setitem(sys.modules, "services.generator", generator)
    from services import vision
    return vision


def image_payloads(message):
    result = []
    for block in message.content:
        if block.get("type") == "image_url":
            header, data = block["image_url"]["url"].split(",", 1)
            assert header == "data:image/png;base64"
            result.append(base64.b64decode(data, validate=True))
    return result


def test_observation_model_receives_image_bytes_and_canonical_history(monkeypatch):
    vision = providers(monkeypatch)
    images = [{"media_type": "image/png", "data": encoded_image(color=color), "name": "filename-is-not-visual-evidence.png"}
        for color in ("white", "red")]
    captured = {}

    class Model:
        def with_structured_output(self, schema):
            captured["schema"] = schema
            return self

        def invoke(self, messages, config=None):
            captured["messages"] = messages
            captured["config"] = config
            return {"observations": ["A visible diagram", "A visible equation"], "search_query": "Explain the diagram and equation"}

    monkeypatch.setattr(vision, "vision_llm", lambda **kwargs: Model())
    history = [{"role": "user", "content": "We are discussing mechanics"}, {"role": "assistant", "content": "Which diagram?"}]
    analysis = vision.observe_images("", images, history=history, config={"tags": ["fixture"]})
    assert analysis.search_query == "Explain the diagram and equation"
    assert len(analysis.observations) == len(images)
    assert captured["schema"] is vision.ImageAnalysis
    assert [message.content for message in captured["messages"][1:-1]] == [item["content"] for item in history]
    assert image_payloads(captured["messages"][-1]) == [item["data"] for item in images]
    assert "filename-is-not-visual-evidence" not in str(captured["messages"])
    assert captured["config"] == {"tags": ["fixture"]}


def test_visual_answer_receives_images_and_keeps_textbook_citations_separate(monkeypatch):
    vision = providers(monkeypatch)
    image = {"media_type": "image/png", "data": encoded_image()}
    captured = {}

    class Model:
        def invoke(self, messages, config=None):
            captured["messages"] = messages
            return SimpleNamespace(content=[{"type": "text", "text": "The graph rises [Image 1]. "},
                {"type": "text", "text": "The textbook explains the force [Source 1]."}])

    monkeypatch.setattr(vision, "vision_llm", lambda **kwargs: Model())
    document = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    chunks = [{"id": "chunk-one", "rerank_score": .8, "payload": {
        "document_id": document, "page_number": 7, "text": "The resultant force equals mass times acceleration."}}]
    answer = vision.generate_visual_answer("Interpret the axes", [image], ["A graph with increasing y values"],
        history=[{"role": "user", "content": "Earlier mechanics question"}], chunks=chunks)
    assert image_payloads(captured["messages"][-1]) == [image["data"]]
    text = captured["messages"][-1].content[0]["text"]
    assert "[Image 1] A graph with increasing y values" in text
    assert "[Source 1]" in text and chunks[0]["payload"]["text"] in text
    assert captured["messages"][1].content == "Earlier mechanics question"
    assert "[Source 1][Source 2]" in captured["messages"][0].content
    assert "never combine sources" in captured["messages"][0].content
    assert answer["answer"] == "The graph rises [Image 1]. The textbook explains the force [Source 1]."
    assert len(answer["citations"]) == 1
    assert answer["citations"][0]["document_id"] == document
    assert answer["citations"][0]["page_number"] == 7
    assert answer["is_grounded"] is False
    assert answer["warning"] == vision.IMAGE_WARNING


def test_incomplete_observation_response_cannot_drop_an_uploaded_image(monkeypatch):
    vision = providers(monkeypatch)

    class Model:
        def with_structured_output(self, schema):
            return self

        def invoke(self, messages, config=None):
            return {"observations": ["Only one image described"], "search_query": "Explain the images"}

    monkeypatch.setattr(vision, "vision_llm", lambda **kwargs: Model())
    images = [{"media_type": "image/png", "data": encoded_image(color=color)} for color in ("white", "red")]
    with pytest.raises(ValueError, match="every image"):
        vision.observe_images("", images)


def test_dimension_limit_and_animation_are_validated_from_decoded_content():
    build_app()
    from services.chat_attachments import validate_image
    with pytest.raises(HTTPException) as oversized:
        validate_image(encoded_image(size=(8193, 1)), "image/png")
    assert oversized.value.status_code == 413
    output = BytesIO()
    Image.new("RGB", (24, 20), "white").save(output, format="PNG", save_all=True,
        append_images=[Image.new("RGB", (24, 20), "red")], duration=100, loop=0)
    with pytest.raises(HTTPException) as animated:
        validate_image(output.getvalue(), "image/png")
    assert animated.value.status_code == 415


def test_public_image_bucket_fails_closed_before_any_object_access(monkeypatch):
    build_app()
    from services.chat_attachments import private_storage
    object_access = []
    monkeypatch.setattr(Storage, "get_bucket", lambda self, name: {"public": True}, raising=False)
    monkeypatch.setattr(Storage, "from_", lambda self, name: object_access.append(name))
    with pytest.raises(HTTPException) as rejected:
        private_storage()
    assert rejected.value.status_code == 503
    assert not object_access


def test_text_only_fingerprints_remain_compatible_with_saved_pre_image_turns():
    from services.chat_history import request_hash
    # Literal produced by the pre-image implementation, with its original five
    # request fields and pipeline. Empty images must not change replay identity.
    legacy = "183ae798b83a5bd987f08a3b5aa3e2dbce24fdc621541b794c40a22e42bf78ac"
    values = {"query": "Explain the chapter", "top_k": 5, "use_analysis": False,
        "document_ids": None, "document_id": None}
    assert request_hash(SimpleNamespace(**values), "linear") == legacy
    assert request_hash(SimpleNamespace(**values, attachment_ids=[]), "linear") == legacy


def test_image_order_changes_request_identity_for_first_and_second_image_prompts():
    from services.chat_history import request_hash
    images = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]
    values = {"query": "Compare the first image with the second", "top_k": 5, "use_analysis": False,
        "document_ids": None, "document_id": None}
    original = SimpleNamespace(**values, attachment_ids=images)
    swapped = SimpleNamespace(**values, attachment_ids=list(reversed(images)))
    assert request_hash(original, "linear") != request_hash(swapped, "linear")


def test_real_agent_generator_and_reflection_receive_images_and_identical_source_numbers(monkeypatch):
    from langchain_core.runnables import RunnableLambda
    vision = providers(monkeypatch)
    captured = []

    class InitializationModel:
        def with_structured_output(self, schema):
            return RunnableLambda(lambda value: schema(is_grounded=True, confidence_score=90, critique="Fixture evaluator"))

    class CaptureModel:
        def __init__(self, schema=None):
            self.schema = schema

        def with_structured_output(self, schema):
            return CaptureModel(schema)

        def invoke(self, messages, config=None):
            captured.append((self.schema, messages, config))
            if self.schema:
                return self.schema(is_grounded=True, confidence_score=91, critique="The visible axes and source claims agree.")
            return SimpleNamespace(content="The graph rises [Image 1], consistent with the first textbook source [Source 1].")

    monkeypatch.setattr(sys.modules["core.llm"], "get_llm", lambda **kwargs: InitializationModel())
    monkeypatch.setattr(sys.modules["services.analyzer"], "QueryAnalysis", object, raising=False)
    monkeypatch.setattr(vision, "vision_llm", lambda **kwargs: CaptureModel())
    spec = importlib.util.spec_from_file_location("agents._image_test_nodes", BACKEND / "agents/nodes.py")
    nodes = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nodes)
    monkeypatch.setattr(nodes, "vision_llm", lambda **kwargs: CaptureModel())
    images = [{"media_type": "image/png", "data": encoded_image()}]
    chunks = [{"id": f"chunk-{index}", "payload": {
        "document_id": f"00000000-0000-4000-8000-{index:012d}", "page_number": index,
        "text": f"Distinct textbook excerpt number {index}."}} for index in range(1, 5)]
    state = {"query": "Compare this image", "rewritten_query": "Compare the graph with textbook mechanics",
        "images": images, "image_observations": ["A graph with labelled axes"], "documents": chunks,
        "history": [{"role": "user", "content": "Earlier mechanics question"}]}
    config = {"tags": ["fixture-agent"]}
    generated = nodes.generator_node(state, config)
    reflected = nodes.reflection_node({**state, **generated}, config)
    assert len(captured) == 2
    assert captured[0][0] is None
    assert captured[1][0] is nodes.ReflectionGrade
    assert image_payloads(captured[0][1][-1]) == [images[0]["data"]]
    assert image_payloads(captured[1][1][-1]) == [images[0]["data"]]
    generation_text = captured[0][1][-1].content[0]["text"]
    reflection_text = captured[1][1][-1].content[0]["text"]
    assert state["rewritten_query"] in generation_text and state["rewritten_query"] in reflection_text
    # Four sources trigger the generator's context reordering. The evaluator
    # must assess the same source numbers, rather than the retrieval order.
    assert [item["page_number"] for item in generated["citations"]] == [1, 3, 4, 2]
    for citation in generated["citations"]:
        source = f'[Source {citation["source_id"]}] (Document: {citation["document_id"]}, Page {citation["page_number"]}):\n{citation["text"]}'
        assert source in generation_text and source in reflection_text
    assert reflected["confidence_score"] == 91
    assert reflected["is_grounded"] is False
    assert "separate from textbook citations" in reflected["critique"]
    assert captured[0][2] == captured[1][2] == config
