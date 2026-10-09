"""Shared conversational response and retrieval policy for both chat pipelines."""
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from core.llm import get_llm
from services.chat_stream import model_answer
from services.relevance import relevant_chunks

GENERAL_KNOWLEDGE_WARNING = "Answered using general AI knowledge; not found in your uploaded documents"


def generate_conversational_answer(query, intent, history=None, config=None, emit=None):
    instructions = (
        "You are Textbook, a friendly assistant that helps users understand uploaded documents. "
        "Respond naturally to greetings and questions about your capabilities."
        if intent == "casual_chat" else
        "You are Textbook, a helpful educational assistant. Answer using general knowledge. "
        "Be clear about uncertainty. You have no supporting document sources for this answer."
    )
    messages = [SystemMessage(content=instructions + " Do not invent document citations or claim to have read uploaded files.")]
    for message in history or []:
        cls = HumanMessage if message["role"] == "user" else AIMessage
        messages.append(cls(content=message["content"]))
    messages.append(HumanMessage(content=query))
    if emit:
        emit("citations", {"citations": [], "intent": intent, "is_grounded": False,
            "warning": GENERAL_KNOWLEDGE_WARNING if intent == "general_knowledge" else None})
    answer = model_answer(get_llm(temperature=0.2, max_tokens=2048), messages, config, emit)
    return {"answer": answer, "citations": [], "intent": intent, "is_grounded": False,
            "warning": GENERAL_KNOWLEDGE_WARNING if intent == "general_knowledge" else None}
