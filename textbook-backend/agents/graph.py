from langgraph.graph import StateGraph, START, END
from .nodes import planner_node, retriever_node, reflection_node, generator_node
from .state import AgentState

def should_continue(state: AgentState) -> str:
    # stop loop if grounded or max iterations reached
    if state.get("is_grounded", True) or state.get("iteration_count", 0) >= state.get("max_iterations", 2):
        return END
    return "retriever_node"

graph = StateGraph(AgentState)

graph.add_node("planner_node", planner_node)
graph.add_node("retriever_node", retriever_node)
graph.add_node("generator_node", generator_node)
graph.add_node("reflection_node", reflection_node)

graph.add_edge(START, "planner_node")
graph.add_edge("planner_node", "retriever_node")
graph.add_edge("retriever_node", "generator_node")
graph.add_edge("generator_node", "reflection_node")

graph.add_conditional_edges(
    "reflection_node",
    should_continue,
    {
        END: END,
        "retriever_node": "retriever_node"
    }
)

graph = graph.compile()

if __name__ == "__main__":
    test_state: AgentState = {
        "user_id": "test_user",
        "query": "What is the difference between dense and sparse search?",
        "max_iterations": 2,
    }
    result = graph.invoke(test_state)
    print("--- Graph Result ---")
    print("Answer:", result.get("answer"))
    print("Citations:", result.get("citations"))
    print("Is Grounded:", result.get("is_grounded"))
    print("Confidence:", result.get("confidence_score"))
    print("Critique:", result.get("critique"))
