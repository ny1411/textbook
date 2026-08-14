from qdrant_client.models import VectorParams, Distance, HnswConfigDiff, SparseVectorParams
from qdrant_client.models import ScalarQuantization, ScalarQuantizationConfig, ScalarType
from fastembed import SparseTextEmbedding
from db.qdrant import client

bm25_model = SparseTextEmbedding(model_name="Qdrant/bm25")

def init_connection(
    collection_name: str = "textbook_chunks", 
    use_quantization: bool = False,
    hnsw_m: int = 16,
    hnsw_ef_construct: int = 100,  
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

    client.create_collection(
        collection_name=collection_name,
        vectors_config=dense_config,
        sparse_vectors_config=sparse_config
    )