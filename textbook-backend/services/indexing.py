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

DENSE_VECTOR_NAME = "dense-text"
DENSE_VECTOR_SIZE = 1024
SPARSE_VECTOR_NAME = "sparse-text"


def validate_collection_configuration(
    collection_name: str = "textbook_chunks",
    payload_indexes: list[dict] | None = None,
    *,
    require_payload_indexes: bool = True,
):
    """Read and validate the deployed collection without changing stored data.

    An existing collection with incompatible vectors requires an explicit data
    migration. Provisioning must never recreate it to repair a schema mismatch.
    """
    collection = client.get_collection(collection_name)
    params = collection.config.params
    vectors = params.vectors
    dense = vectors.get(DENSE_VECTOR_NAME) if isinstance(vectors, dict) else None
    errors = []
    if dense is None:
        errors.append(f"missing named vector {DENSE_VECTOR_NAME}")
    else:
        if dense.size != DENSE_VECTOR_SIZE:
            errors.append(f"{DENSE_VECTOR_NAME} must have size {DENSE_VECTOR_SIZE}")
        if dense.distance != Distance.COSINE:
            errors.append(f"{DENSE_VECTOR_NAME} must use Cosine distance")
    if SPARSE_VECTOR_NAME not in (params.sparse_vectors or {}):
        errors.append(f"missing named vector {SPARSE_VECTOR_NAME}")

    if require_payload_indexes:
        desired_indexes = DEFAULT_PAYLOAD_INDEXES if payload_indexes is None else payload_indexes
        for index in desired_indexes:
            if _index_needs_update((collection.payload_schema or {}).get(index["field_name"]), index):
                errors.append(f"missing or incompatible payload index {index['field_name']}")

    if errors:
        raise ValueError(
            f"Incompatible Qdrant collection {collection_name!r}: " + "; ".join(errors)
        )
    return collection


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
    desired_indexes = DEFAULT_PAYLOAD_INDEXES if payload_indexes is None else payload_indexes
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
            DENSE_VECTOR_NAME: VectorParams(
                size=DENSE_VECTOR_SIZE,
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
            DENSE_VECTOR_NAME: VectorParams(
                size=DENSE_VECTOR_SIZE,
                distance=Distance.COSINE,
                hnsw_config=HnswConfigDiff(m=hnsw_m, ef_construct=hnsw_ef_construct)
            )
        }

    sparse_config = {
        SPARSE_VECTOR_NAME: SparseVectorParams()
    }

    if not client.collection_exists(collection_name):
        client.create_collection(
            collection_name=collection_name,
            vectors_config=dense_config,
            sparse_vectors_config=sparse_config
        )

    # Fail before any index writes if the existing collection cannot be used by
    # ingestion and hybrid retrieval. Never reset a populated collection.
    validate_collection_configuration(
        collection_name=collection_name,
        require_payload_indexes=False,
    )
    ensure_payload_indexes(
        collection_name=collection_name,
        payload_indexes=payload_indexes,
    )
