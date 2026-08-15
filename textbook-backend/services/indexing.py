from qdrant_client.models import VectorParams, Distance, HnswConfigDiff, SparseVectorParams
from qdrant_client.models import ScalarQuantization, ScalarQuantizationConfig, ScalarType
from fastembed import SparseTextEmbedding
from db.qdrant import client
from qdrant_client import models

bm25_model = SparseTextEmbedding(model_name="Qdrant/bm25")

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

def init_connection(
    collection_name: str = "textbook_chunks", 
    use_quantization: bool = False,
    hnsw_m: int = 16,
    hnsw_ef_construct: int = 100,  
    payload_indexes: list[dict] = [
        {"field_name": "user_id", "field_schema": "keyword"},
        {"field_name": "document_id", "field_schema": "keyword"},
        {"field_name": "page_number", "field_schema": "integer"},
        {"field_name": "chunk_id", "field_schema": "keyword"},
    ]
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

    for index in payload_indexes:
        enum = schema_mapper.get(index["field_schema"], models.PayloadSchemaType.KEYWORD)
        client.create_payload_index(
            collection_name=collection_name,
            field_name=index["field_name"],
            field_schema=enum
        )