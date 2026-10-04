"""Mocked diagnostic tests; these do not verify production access."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("issue5_preflight", Path(__file__).with_name("preflight.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class PreflightTests(unittest.TestCase):
    def run_check(self, database_url):
        policy = {"tcp_network_access": {"domains": [], "ip_ranges": []},
                  "http_network_policy": {"type": "restricted", "egress_rules": []}}
        output = io.StringIO()
        with patch.dict(os.environ, {"DATABASE_URL": database_url, "E2E_STORAGE_STATE": "/tmp/private-session", "E2E_NOTEBOOK_ID": "test-notebook"}, clear=True), \
                patch.object(checker.importlib.util, "find_spec", return_value=object()), \
                patch.object(checker.Path, "read_text", return_value=json.dumps(policy)), \
                patch.object(checker.Path, "is_file", return_value=True), \
                patch.object(checker, "probe", side_effect=lambda name, *args: {"check": name, "status": "pass", "detail": "fixture"}), \
                contextlib.redirect_stdout(output):
            checker.main()
        serialized = output.getvalue()
        self.assertNotIn("secret-password", serialized)
        report = json.loads(serialized)
        self.assertFalse(report["live_roundtrip"])
        return {item["check"]: item for item in report["checks"]}

    def test_local_database_needs_live_check_not_external_tcp_grant(self):
        checks = self.run_check("postgresql://user:secret-password@localhost/db")
        self.assertEqual(checks["postgresql-network"]["status"], "unverified")

    def test_remote_database_blocked_by_empty_tcp_grants(self):
        checks = self.run_check("postgresql://user:secret-password@remote.invalid/db")
        self.assertEqual(checks["postgresql-network"]["status"], "blocked")

    def test_download_restriction_does_not_rule_out_preloaded_models(self):
        checks = self.run_check("postgresql://user:secret-password@localhost/db")
        self.assertEqual(checks["model-download-policy"]["status"], "unverified")

    def test_provider_exception_details_not_exposed(self):
        with patch.object(checker.urllib.request, "urlopen", side_effect=RuntimeError("Bearer secret-token")):
            result = checker.probe("fixture", "https://allowed.invalid", {"Authorization": "Bearer secret-token"})
        self.assertEqual(result["status"], "fail")
        self.assertNotIn("secret-token", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
