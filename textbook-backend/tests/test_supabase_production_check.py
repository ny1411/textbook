import asyncio
import importlib.util
import json
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_supabase.py"
spec = importlib.util.spec_from_file_location("check_supabase", SCRIPT)
checker = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = checker
spec.loader.exec_module(checker)


@pytest.fixture
def valid_env():
    return {
        "SUPABASE_URL": "https://test-project.supabase.invalid",
        "SUPABASE_SECRET_KEY": "private-server-key-do-not-print",
        "DATABASE_URL": "postgresql://user:private-password@db.invalid:5432/postgres?sslmode=require&sslaccept=strict",
    }


@pytest.mark.parametrize("variable,value,failed_check", [
    ("SUPABASE_URL", "http://test-project.invalid", "SUPABASE_URL"),
    ("SUPABASE_URL", "https://user:password@test-project.invalid", "SUPABASE_URL"),
    ("SUPABASE_URL", "https://test-project.invalid/rest/v1", "SUPABASE_URL"),
    ("SUPABASE_URL", "https://test-project.invalid:bad", "SUPABASE_URL"),
    ("SUPABASE_SECRET_KEY", "", "SUPABASE_SECRET_KEY"),
    ("DATABASE_URL", "postgresql://db.invalid:99999/postgres", "DATABASE_URL"),
    ("DATABASE_URL", "postgresql://db.invalid", "DATABASE_URL"),
    ("DATABASE_URL", "postgresql://db.invalid/postgres", "database_tls_configuration"),
    ("DATABASE_URL", "postgresql://db.invalid/postgres?sslmode=require&sslaccept=accept_invalid_certs", "database_tls_configuration"),
    ("DATABASE_URL", "postgresql://db.invalid/postgres?sslmode=require&sslmode=disable&sslaccept=strict", "database_tls_configuration"),
])
def test_rejects_missing_or_insecure_production_configuration(valid_env, variable, value, failed_check):
    valid_env[variable] = value
    checks = {check.name: check for check in checker.check_configuration(valid_env)}
    assert checks[failed_check].status == "fail"
    serialized = json.dumps([check.__dict__ for check in checks.values()])
    assert "private-server-key" not in serialized
    assert "private-password" not in serialized


class RestClient:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def table(self, table):
        self.calls.append(("table", table))
        return self

    def select(self, columns, **kwargs):
        self.calls.append(("select", columns, kwargs))
        return self

    def limit(self, amount):
        self.calls.append(("limit", amount))
        return self

    def execute(self):
        if self.error:
            raise self.error


def test_rest_checks_are_zero_row_requests_and_do_not_claim_tcp_success(valid_env):
    client = RestClient()
    checks = checker.run_checks(valid_env, client_factory=lambda url, key: client)
    assert {check.status for check in checks if check.name.startswith("rest:")} == {"pass"}
    assert all(call[2] == {} for call in client.calls if call[0] == "select")
    assert all(call[1] == 0 for call in client.calls if call[0] == "limit")
    assert next(check for check in checks if check.name == "database_connection").status == "blocked"


def test_failed_rest_requests_never_print_exception_details(valid_env):
    error = RuntimeError("private-server-key-do-not-print and private-password in response")
    client = RestClient(error)
    checks = checker.run_checks(valid_env, client_factory=lambda url, key: client)
    assert all(check.status == "fail" for check in checks if check.name.startswith("rest:"))
    serialized = json.dumps([check.__dict__ for check in checks])
    assert "private-server-key" not in serialized
    assert "private-password" not in serialized


def test_invalid_https_url_prevents_remote_requests(valid_env):
    valid_env["SUPABASE_URL"] = "http://project.invalid"
    def unexpected_request(*args):
        pytest.fail("Invalid configuration must prevent requests")
    checks = checker.run_checks(valid_env, client_factory=unexpected_request)
    assert next(check for check in checks if check.name == "rest_schema").status == "blocked"


def test_provider_code_is_reported_without_message_or_arbitrary_strings():
    error = RuntimeError("provider response contains private row data")
    error.code = "PGRST205"
    assert "PGRST205" in checker.safe_failure(error)
    assert "private row data" not in checker.safe_failure(error)
    error.code = "private-server-key-do-not-print"
    assert "private-server-key" not in checker.safe_failure(error)


class Database:
    def __init__(self, tls=True, fail_table=False):
        self.connected = False
        self.queries = []
        self.tls = tls
        self.fail_table = fail_table

    async def connect(self):
        self.connected = True

    async def disconnect(self):
        self.connected = False

    def is_connected(self):
        return self.connected

    async def query_raw(self, query):
        self.queries.append(query)
        if "pg_stat_ssl" in query:
            return [{"ssl": self.tls}]
        if self.fail_table:
            raise RuntimeError("private-password in database response")
        assert query.startswith("SELECT ") and query.endswith(" WHERE FALSE")
        return []


def test_database_uses_explicit_configuration_and_select_only_queries(valid_env):
    database = Database()
    options = {}
    def factory(**kwargs):
        options.update(kwargs)
        return database
    checks = asyncio.run(checker.check_database(valid_env["DATABASE_URL"], client_factory=factory))
    assert options["datasource"] == {"url": valid_env["DATABASE_URL"]}
    assert options["use_dotenv"] is False
    assert all(check.status == "pass" for check in checks)
    assert all(query.startswith("SELECT ") for query in database.queries)
    assert not database.connected


def test_database_tls_and_schema_failures_stay_failed_and_disconnect(valid_env):
    database = Database(tls=False, fail_table=True)
    checks = asyncio.run(checker.check_database(valid_env["DATABASE_URL"], client_factory=lambda **kwargs: database))
    assert next(check for check in checks if check.name == "database_tls_live").status == "fail"
    assert all(check.status == "fail" for check in checks if check.name.startswith("database:"))
    assert "private-password" not in json.dumps([check.__dict__ for check in checks])
    assert not database.connected


def test_database_constructor_failure_does_not_leak_url(valid_env):
    def invalid_factory(**kwargs):
        raise ValueError(kwargs["datasource"]["url"])
    checks = asyncio.run(checker.check_database(valid_env["DATABASE_URL"], client_factory=invalid_factory))
    assert checks[0].status == "fail"
    assert "private-password" not in json.dumps([check.__dict__ for check in checks])


def test_database_flag_does_not_connect_with_insecure_tls(valid_env, monkeypatch):
    valid_env["DATABASE_URL"] = "postgresql://db.invalid/postgres"
    async def unexpected_database(*args):
        pytest.fail("Invalid TLS must prevent a database connection")
    monkeypatch.setattr(checker, "check_database", unexpected_database)
    checks = checker.run_checks(valid_env, database=True, client_factory=lambda *args: RestClient())
    assert next(check for check in checks if check.name == "database_connection").status == "blocked"


@pytest.mark.parametrize("status,expected_exit", [("pass", 0), ("fail", 1), ("blocked", 1)])
def test_cli_returns_nonzero_for_failures_and_blockers(monkeypatch, capsys, status, expected_exit):
    monkeypatch.setattr(checker, "run_checks", lambda *args, **kwargs: [checker.Check("example", status, "safe detail")])
    assert checker.main([]) == expected_exit
    assert json.loads(capsys.readouterr().out)["verified"] is (status == "pass")


def test_private_tables_need_not_be_exposed_to_postgrest(monkeypatch, capsys):
    checks = [
        checker.Check("database_connection", "pass", "safe detail"),
        checker.Check("rest:users", "fail", "not exposed to REST", required=False),
    ]
    monkeypatch.setattr(checker, "run_checks", lambda *args, **kwargs: checks)
    assert checker.main([]) == 0
    assert json.loads(capsys.readouterr().out)["verified"] is True
