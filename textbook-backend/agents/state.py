from typing import Dict, List, Optional, TypedDict, Any

class AgentState(TypedDict, total=False):
    user_id: str
    query: str
    rewritten_query: Optional[str]
    document_id: Optional[str]
    sub_queries: List[str]
    documents: List[Dict[str, Any]]
    answer: Optional[str]
    citations: List[Dict[str, Any]]
    confidence_score: int
    iteration_count: int
    max_iterations: int
    critique: Optional[str]
    is_grounded: bool