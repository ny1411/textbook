import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.analyzer import analyze_query, QueryAnalysis

def test_analyzer_complex_query():
    query = "I have a feature where I have added snow and rain effect in the banner image on top of normal image. I want more ideas to customize hero banner for fun. Like right now, when user is in dark mode, the night version of banner image is shown and when in light the day version is shown."
    analysis = analyze_query(query)
    assert analysis is not None, "Query analysis should not be None"
    assert isinstance(analysis, QueryAnalysis), "Result must be a QueryAnalysis instance"
    assert analysis.intent in ["search", "summarize", "casual_chat"], f"Invalid intent: {analysis.intent}"
    assert len(analysis.rewritten_query) > 0, "Rewritten query should not be empty"
    assert len(analysis.hyde_document) > 0, "HyDE document should not be empty"
    
    print("Complex Query Analysis:")
    print(f"  Intent: {analysis.intent}")
    print(f"  Rewritten Query: {analysis.rewritten_query}")
    print(f"  Sub-queries: {analysis.sub_queries}")
    print(f"  HyDE snippet: {analysis.hyde_document[:120]}...")

def test_analyzer_casual_query():
    casual_query = "Hello, how are you today?"
    analysis = analyze_query(casual_query)
    assert analysis is not None, "Casual query analysis should not be None"
    assert isinstance(analysis, QueryAnalysis)
    print("Casual Query Analysis:")
    print(f"  Intent: {analysis.intent}")
    print(f"  Rewritten Query: {analysis.rewritten_query}")

if __name__ == "__main__":
    test_analyzer_complex_query()
    test_analyzer_casual_query()