import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

def get_llm(
    temperature: float = 1.0,
    max_tokens: int = 8192,
    timeout: int = 90,
    top_p: float = 0.9,
    top_k: int = 1,
    model: str = "gemini-3.6-flash"
) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=temperature,
        max_output_tokens=max_tokens,
        timeout=timeout,
        top_p=top_p,
        top_k=top_k,
        max_retries=3,
    )
