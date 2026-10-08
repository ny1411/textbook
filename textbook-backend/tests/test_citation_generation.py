"""Verify the actual model prompt and returned source identity without live providers."""
import importlib.util

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from history_fixture import BACKEND, build_app


def test_text_generator_uses_separate_citation_tags_and_keeps_source_identity(monkeypatch):
    build_app()
    spec = importlib.util.spec_from_file_location("_citation_test_generator", BACKEND / "services/generator.py")
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    captured = []

    def model(prompt):
        captured.extend(prompt.to_messages())
        return AIMessage(content="Shared evidence [Source 1][Source 2].")

    monkeypatch.setattr(generator, "get_llm", lambda **kwargs: RunnableLambda(model))
    chunks = [{"id": f"chunk-{page}", "payload": {"document_id": f"document-{page}",
        "page_number": page, "text": f"Evidence passage {page}."}} for page in range(1, 5)]
    result = generator.generate_answer("Explain the evidence", chunks)
    assert "[Source 1][Source 2]" in captured[0].content
    assert "Never combine" in captured[0].content
    assert result["answer"] == "Shared evidence [Source 1][Source 2]."
    assert [citation["page_number"] for citation in result["citations"]] == [1, 3, 4, 2]
    for citation in result["citations"]:
        assert f'[Source {citation["source_id"]}] (Document: {citation["document_id"]}, Page {citation["page_number"]})' in captured[1].content
