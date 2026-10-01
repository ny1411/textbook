import json
import os
import sys
from types import SimpleNamespace

import pytest
from qdrant_client import QdrantClient, models

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scripts import qdrant_smoke
from services import indexing


def collection_info(*, size=1024, distance=models.Distance.COSINE, sparse=True, indexes=True):
    payload_schema = {}
    if indexes:
        for index in indexing.DEFAULT_PAYLOAD_INDEXES:
            schema = indexing._build_field_schema(index)
            payload_schema[index["field_name"]] = SimpleNamespace(
                data_type=indexing.schema_mapper[index["field_schema"]],
                params=schema if isinstance(schema, models.KeywordIndexParams) else None,
            )
    return SimpleNamespace(
        config=SimpleNamespace(params=SimpleNamespace(
            vectors={"dense-text": models.VectorParams(size=size, distance=distance)},
            sparse_vectors={"sparse-text": models.SparseVectorParams()} if sparse else None,
        )),
        payload_schema=payload_schema,
        status=models.CollectionStatus.GREEN,
    )


class ProvisioningClient:
    def __init__(self, collection=None):
        self.collection = collection
        self.writes = []

    def collection_exists(self, name):
        return self.collection is not None

    def get_collection(self, name):
        return self.collection

    def create_collection(self, **kwargs):
        self.writes.append(("collection", kwargs))
        self.collection = collection_info(indexes=False)
        self.collection.config.params.vectors = kwargs["vectors_config"]
        self.collection.config.params.sparse_vectors = kwargs["sparse_vectors_config"]

    def create_payload_index(self, **kwargs):
        self.writes.append(("index", kwargs))
        schema = kwargs["field_schema"]
        self.collection.payload_schema[kwargs["field_name"]] = SimpleNamespace(
            data_type=schema.type if isinstance(schema, models.KeywordIndexParams) else schema,
            params=schema if isinstance(schema, models.KeywordIndexParams) else None,
        )


@pytest.mark.parametrize("changes,expected", [
    ({"size": 768}, "must have size 1024"),
    ({"distance": models.Distance.DOT}, "must use Cosine"),
    ({"sparse": False}, "missing named vector sparse-text"),
])
def test_provisioning_rejects_incompatible_collection_before_writes(monkeypatch, changes, expected):
    fake = ProvisioningClient(collection_info(**changes))
    monkeypatch.setattr(indexing, "client", fake)
    with pytest.raises(ValueError, match=expected):
        indexing.init_connection()
    assert fake.writes == []


def test_validation_rejects_unnamed_dense_vector(monkeypatch):
    collection = collection_info()
    collection.config.params.vectors = models.VectorParams(size=1024, distance=models.Distance.COSINE)
    monkeypatch.setattr(indexing, "client", ProvisioningClient(collection))
    with pytest.raises(ValueError, match="missing named vector dense-text"):
        indexing.validate_collection_configuration()


def test_existing_compatible_collection_is_unchanged_on_repeat_provisioning(monkeypatch):
    fake = ProvisioningClient(collection_info())
    monkeypatch.setattr(indexing, "client", fake)
    indexing.init_connection()
    indexing.init_connection()
    assert fake.writes == []


def test_missing_collection_is_created_once_with_dense_sparse_and_tenant_indexes(monkeypatch):
    fake = ProvisioningClient()
    monkeypatch.setattr(indexing, "client", fake)
    indexing.init_connection()
    assert len(fake.writes) == 6
    _, creation = fake.writes[0]
    assert creation["vectors_config"]["dense-text"].size == 1024
    assert creation["vectors_config"]["dense-text"].distance == models.Distance.COSINE
    assert "sparse-text" in creation["sparse_vectors_config"]
    notebook_index = next(kwargs for kind, kwargs in fake.writes if kind == "index" and kwargs["field_name"] == "notebook_id")
    assert notebook_index["field_schema"].is_tenant is True
    assert notebook_index["wait"] is True
    fake.writes.clear()
    indexing.init_connection()
    assert fake.writes == []


def test_smoke_requires_notebook_tenant_index(monkeypatch):
    collection = collection_info()
    collection.payload_schema["notebook_id"].params.is_tenant = False
    monkeypatch.setattr(indexing, "client", ProvisioningClient(collection))
    with pytest.raises(ValueError, match="incompatible payload index notebook_id"):
        indexing.validate_collection_configuration()


def test_empty_custom_indexes_do_not_create_default_indexes(monkeypatch):
    fake = ProvisioningClient(collection_info(indexes=False))
    monkeypatch.setattr(indexing, "client", fake)
    indexing.init_connection(payload_indexes=[])
    indexing.validate_collection_configuration(payload_indexes=[])
    assert fake.writes == []


def test_read_only_smoke_uses_filtered_named_vectors_without_payload_reads(monkeypatch):
    fake = ProvisioningClient(collection_info())
    calls = []
    fake.query_points = lambda **kwargs: calls.append(kwargs) or SimpleNamespace(points=[])
    fake.count = lambda name, exact: SimpleNamespace(count=1063)
    monkeypatch.setattr(indexing, "client", fake)
    result = qdrant_smoke.verify_collection("textbook_chunks")
    assert result["point_count"] == 1063
    assert result["vector_queries"] == ["dense-text", "sparse-text"]
    assert fake.writes == []
    assert len(calls) == 2
    for call in calls:
        assert call["with_payload"] is False
        assert call["with_vectors"] is False
        assert {condition.key for condition in call["query_filter"].must} == {"user_id", "notebook_id", "document_id"}
    assert calls[0]["query_filter"] == calls[1]["query_filter"]
    assert len(calls[0]["query"]) == 1024


def test_smoke_cli_missing_configuration_returns_nonzero(monkeypatch, capsys):
    monkeypatch.setattr(qdrant_smoke, "load_dotenv", lambda *args: None)
    monkeypatch.delenv("QDRANT_URL", raising=False)
    monkeypatch.delenv("QDRANT_API_KEY", raising=False)
    assert qdrant_smoke.main([]) == 1
    assert json.loads(capsys.readouterr().out)["status"] == "failed"


def test_smoke_cli_redacts_remote_errors_and_does_not_provision_by_default(monkeypatch, capsys):
    monkeypatch.setenv("QDRANT_URL", "https://qdrant.invalid")
    monkeypatch.setenv("QDRANT_API_KEY", "test-only-secret")
    monkeypatch.setattr(indexing, "init_connection", lambda **kwargs: pytest.fail("Default smoke must be read-only"))

    def fail(name):
        raise ValueError("Remote response with test-only-secret")

    monkeypatch.setattr(qdrant_smoke, "verify_collection", fail)
    assert qdrant_smoke.main([]) == 1
    assert json.loads(capsys.readouterr().out) == {"status": "failed", "error": "ValueError"}


def test_dense_and_sparse_queries_obey_user_and_notebook_scope_in_memory():
    # Exercise the real SDK/query engine locally. Fixtures never touch Cloud.
    local = QdrantClient(":memory:")
    try:
        local.create_collection(
            "scope-test",
            vectors_config={"dense-text": models.VectorParams(size=1024, distance=models.Distance.COSINE)},
            sparse_vectors_config={"sparse-text": models.SparseVectorParams()},
        )
        dense = [1.0] + [0.0] * 1023
        sparse = models.SparseVector(indices=[42], values=[1.0])
        local.upsert("scope-test", points=[
            models.PointStruct(id=1, vector={"dense-text": dense, "sparse-text": sparse}, payload={"user_id": "a", "notebook_id": "one"}),
            models.PointStruct(id=2, vector={"dense-text": dense, "sparse-text": sparse}, payload={"user_id": "b", "notebook_id": "one"}),
            models.PointStruct(id=3, vector={"dense-text": dense, "sparse-text": sparse}, payload={"user_id": "a", "notebook_id": "two"}),
        ])
        query_filter = models.Filter(must=[
            models.FieldCondition(key="user_id", match=models.MatchValue(value="a")),
            models.FieldCondition(key="notebook_id", match=models.MatchValue(value="one")),
        ])
        for name, vector in [("dense-text", dense), ("sparse-text", sparse)]:
            result = local.query_points("scope-test", query=vector, using=name, query_filter=query_filter)
            assert [point.id for point in result.points] == [1]
    finally:
        local.close()
