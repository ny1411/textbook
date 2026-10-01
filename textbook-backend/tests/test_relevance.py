"""Run with python -m unittest discover -s tests -p test_relevance.py."""
import importlib.util
import math
import os
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.relevance import normalize_relevance, relevant_chunks


class RelevanceTests(unittest.TestCase):
    def test_sigmoid_is_finite_bounded_monotonic_and_stable(self):
        logits = [-1000, -4.2, -1.5, 0, 0.3, 2, 1000]
        scores = [normalize_relevance(value) for value in logits]
        self.assertEqual(scores, sorted(scores))
        self.assertTrue(all(math.isfinite(value) and 0 <= value <= 1 for value in scores))
        self.assertEqual(scores[3], 0.5)
        self.assertAlmostEqual(normalize_relevance(2), 0.8807970779778823)
        for value in [math.nan, math.inf, -math.inf]:
            with self.assertRaises(ValueError):
                normalize_relevance(value)

    def test_existing_logit_threshold_preserves_grounding_policy(self):
        chunks = [{"rerank_logit": value, "rerank_score": normalize_relevance(value)}
                  for value in [-4.2, 0, 2, 1000, 1001]]
        for threshold in [0, 1.5, 1001]:
            with patch.dict(os.environ, {"CHAT_MIN_RERANK_SCORE": str(threshold)}):
                self.assertEqual(relevant_chunks(chunks),
                                 [chunk for chunk in chunks if chunk["rerank_logit"] >= threshold])

    def test_normalized_only_scores_and_invalid_scores(self):
        chunks = [{}, {"rerank_score": None}, {"rerank_score": math.nan},
                  {"rerank_score": -1}, {"rerank_score": 2},
                  {"rerank_score": 0.49}, {"rerank_score": 0.5}, {"rerank_score": 0.9}]
        with patch.dict(os.environ, {"CHAT_MIN_RERANK_SCORE": "0"}):
            self.assertEqual(relevant_chunks(chunks), chunks[-2:])

    def test_reranking_keeps_original_ordering_without_mutating_candidates(self):
        # Isolate the ML adapter; exercise real reranking without downloading weights.
        adapter = ModuleType("langchain_community.cross_encoders")
        adapter.HuggingFaceCrossEncoder = object
        with patch.dict(sys.modules, {"langchain_community.cross_encoders": adapter}):
            spec = importlib.util.spec_from_file_location(
                "reranker_under_test", Path(__file__).resolve().parents[1] / "services/reranker.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        candidates = [{"id": str(index), "payload": {"text": str(index)}} for index in range(6)]
        captured = []

        def score(pairs):
            captured.extend(pairs)
            return [1000, 1001, -4.2, 0.3, math.nan, math.inf]

        with patch.object(module, "get_cross_encoder", return_value=SimpleNamespace(score=score)):
            result = module.reranker_with_cross_encoder("question", candidates, top_k=3)
        self.assertEqual([chunk["id"] for chunk in result], ["1", "0", "3"])
        self.assertTrue(all(0 <= chunk["rerank_score"] <= 1 for chunk in result))
        self.assertEqual(captured, [["question", str(index)] for index in range(6)])
        self.assertTrue(all("rerank_score" not in chunk for chunk in candidates))
        with patch.object(module, "get_cross_encoder", side_effect=AssertionError("No model for empty input")):
            self.assertEqual(module.reranker_with_cross_encoder("question", []), [])


if __name__ == "__main__":
    unittest.main()
