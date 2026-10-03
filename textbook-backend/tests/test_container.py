"""Container behavior tests; external clients/models are deliberately isolated."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from fastapi import APIRouter
from fastapi.testclient import TestClient


BACKEND = Path(__file__).resolve().parents[1]


def load_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        routers = ModuleType("routers")
        routers.api_router = APIRouter()
        indexing = ModuleType("services.indexing")
        indexing.init_connection = Mock()
        self.initialize = indexing.init_connection
        with patch.dict(sys.modules, {"routers": routers, "services.indexing": indexing}):
            self.main = load_file("container_test_main", BACKEND / "main.py")

    def test_readiness_follows_startup_and_shutdown(self):
        app = self.main.app
        client = TestClient(app)
        self.assertEqual(client.get("/healthz").status_code, 503)
        with client:
            self.initialize.assert_called_once_with()
            response = client.get("/healthz")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ready"})
        self.assertEqual(client.get("/healthz").status_code, 503)

    def test_failed_initialization_prevents_readiness(self):
        self.initialize.side_effect = RuntimeError("index setup failed")
        with self.assertRaisesRegex(RuntimeError, "index setup failed"):
            with TestClient(self.main.app):
                self.fail("Server must not start when initialization fails")
        self.assertFalse(self.main.app.state.ready)


class LauncherTests(unittest.TestCase):
    def run_launcher(self, settings):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "python"
            executable.write_text("#!/bin/sh\nprintf '%s\\n' \"$@\"\n")
            executable.chmod(0o755)
            env = {**os.environ, "PATH": directory + os.pathsep + os.environ["PATH"]}
            env.pop("PORT", None)
            env.pop("UVICORN_TIMEOUT_GRACEFUL_SHUTDOWN", None)
            env.update(settings)
            result = subprocess.run(
                ["sh", str(BACKEND / "scripts/start-server.sh")],
                env=env, capture_output=True, text=True, check=True,
            )
            return result.stdout.splitlines()

    def test_default_port_and_single_worker(self):
        self.assertEqual(self.run_launcher({}), [
            "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000",
            "--workers", "1", "--timeout-graceful-shutdown", "120",
        ])

    def test_platform_port_and_shutdown_window(self):
        arguments = self.run_launcher({
            "PORT": "12345", "UVICORN_TIMEOUT_GRACEFUL_SHUTDOWN": "45",
        })
        self.assertEqual(arguments[arguments.index("--port") + 1], "12345")
        self.assertEqual(arguments[arguments.index("--timeout-graceful-shutdown") + 1], "45")


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.probe = load_file("container_test_probe", BACKEND / "scripts/container_healthcheck.py")

    def probe_response(self, status, body):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(status)
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())

            def log_message(self, *args):
                pass

        with HTTPServer(("127.0.0.1", 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with patch.dict(os.environ, {
                    "PORT": str(server.server_port),
                    "HTTP_PROXY": "http://127.0.0.1:1",
                    "HTTPS_PROXY": "http://127.0.0.1:1",
                    "NO_PROXY": "",
                    "http_proxy": "http://127.0.0.1:1",
                    "no_proxy": "",
                }):
                    return self.probe.main()
            finally:
                server.shutdown()
                thread.join(timeout=2)

    def test_ready_localhost_bypasses_proxy(self):
        self.assertEqual(self.probe_response(200, {"status": "ready"}), 0)

    def test_unready_http_status_fails(self):
        self.assertEqual(self.probe_response(503, {"detail": "not ready"}), 1)

    def test_wrong_readiness_body_fails(self):
        self.assertEqual(self.probe_response(200, {"status": "starting"}), 1)

    def test_connection_failure_fails(self):
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            with patch.dict(os.environ, {"PORT": str(reserved.getsockname()[1])}):
                self.assertEqual(self.probe.main(), 1)


if __name__ == "__main__":
    unittest.main()
