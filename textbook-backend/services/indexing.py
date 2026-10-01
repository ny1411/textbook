from qdrant_client.models import VectorParams, Distance, HnswConfigDiff, SparseVectorParams
from qdrant_client.models import ScalarQuantization, ScalarQuantizationConfig, ScalarType
from db.qdrant import client
from qdrant_client import models
import logging

logger = logging.getLogger(__name__)

schema_mapper = {
    "keyword": models.PayloadSchemaType.KEYWORD,
    "integer": models.PayloadSchemaType.INTEGER,
    "float": models.PayloadSchemaType.FLOAT,
    "text": models.PayloadSchemaType.TEXT,
    "bool": models.PayloadSchemaType.BOOL,
    "geo": models.PayloadSchemaType.GEO,
    "datetime": models.PayloadSchemaType.DATETIME,
    "uuid": models.PayloadSchemaType.UUID,
}

DEFAULT_PAYLOAD_INDEXES = [
    {"field_name": "user_id", "field_schema": "keyword"},
    {"field_name": "notebook_id", "field_schema": "keyword", "is_tenant": True},
    {"field_name": "document_id", "field_schema": "keyword"},
    {"field_name": "page_number", "field_schema": "integer"},
    {"field_name": "chunk_id", "field_schema": "keyword"},
]


def _build_field_schema(index: dict):
    schema_type = schema_mapper.get(
        index["field_schema"],
        models.PayloadSchemaType.KEYWORD,
    )
    if index.get("is_tenant") and schema_type == models.PayloadSchemaType.KEYWORD:
        return models.KeywordIndexParams(
            type=models.KeywordIndexType.KEYWORD,
            is_tenant=True,
        )
    return schema_type


def _index_needs_update(existing_index, index: dict) -> bool:
    expected_type = schema_mapper.get(
        index["field_schema"],
        models.PayloadSchemaType.KEYWORD,
    )
    if existing_index is None or existing_index.data_type != expected_type:
        return True

    if index.get("is_tenant"):
        return not bool(getattr(existing_index.params, "is_tenant", False))

    return False


def ensure_payload_indexes(
    collection_name: str = "textbook_chunks",
    payload_indexes: list[dict] | None = None,
) -> None:
    desired_indexes = payload_indexes or DEFAULT_PAYLOAD_INDEXES
    collection = client.get_collection(collection_name)
    existing_indexes = collection.payload_schema or {}

    for index in desired_indexes:
        field_name = index["field_name"]
        if not _index_needs_update(existing_indexes.get(field_name), index):
            continue

        logger.info("Creating or updating Qdrant payload index: %s", field_name)
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field_name,
            field_schema=_build_field_schema(index),
            wait=True,
        )

def init_connection(
    collection_name: str = "textbook_chunks", 
    use_quantization: bool = False,
    hnsw_m: int = 16,
    hnsw_ef_construct: int = 100,
    payload_indexes: list[dict] | None = None,
):
    if use_quantization:
        dense_config = {
            "dense-text": VectorParams(
                size=1024,
                distance=Distance.COSINE,
                hnsw_config=HnswConfigDiff(m=hnsw_m, ef_construct=hnsw_ef_construct),
                quantization_config=ScalarQuantization(
                    scalar=ScalarQuantizationConfig(
                        type=ScalarType.INT8,
                        always_ram=True
                    )
                )
            )
        }
    else:
        dense_config = {
            "dense-text": VectorParams(
                size=1024,
                distance=Distance.COSINE,
                hnsw_config=HnswConfigDiff(m=hnsw_m, ef_construct=hnsw_ef_construct)
            )
        }

    sparse_config = {
        "sparse-text": SparseVectorParams()
    }

    if not client.collection_exists(collection_name):
        client.create_collection(
            collection_name=collection_name,
            vectors_config=dense_config,
            sparse_vectors_config=sparse_config
        )

    ensure_payload_indexes(
        collection_name=collection_name,
        payload_indexes=payload_indexes,
    )
