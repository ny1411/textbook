from pydantic import BaseModel, Field
from typing import List
from langchain_core.prompts import ChatPromptTemplate
from core.llm import get_llm

class QueryAnalysis(BaseModel):
    intent: str = Field(description="The intent of user must be one of: 'search', 'summarize', 'casual_chat'.")
    rewritten_query: str = Field(description="The user's query must be rewritten to be a clear, standalone search query.")
    sub_queries: List[str] = Field(description="There should be 2-3 smaller sub-queries to help break down complex queries. Keep it empty if query is simple.")
    hyde_document: str = Field(description="A hypothetical paragraph-long answer to the user's query, which can be used for semantic search.")


llm = get_llm(temperature=0.0, max_tokens=1024, timeout=30)
structured_llm = llm.with_structured_output(QueryAnalysis)

system_prompt = """
You are an expert search query analyzer.
Analyze the user's query and provide a comprehensive search plan.
If the intent is 'casual_chat', you can leave sub_queries empty and provide a brief hyde_document.
"""

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{user_query}")
])

analyzer_chain = prompt | structured_llm


def analyze_query(user_query: str) -> QueryAnalysis:
    try:
        return analyzer_chain.invoke({"user_query": user_query})
    except Exception as e:
        print("Error analyzing query:", e)
        return None