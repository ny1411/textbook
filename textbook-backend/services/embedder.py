from functools import lru_cache
from qdrant_client import models
from typing import Union, List, Tuple
from fastembed import SparseTextEmbedding
from langchain_huggingface import HuggingFaceEmbeddings


@lru_cache(maxsize=1)
def bge_large_embedder():
    embeddings = HuggingFaceEmbeddings(
        model_name="BAAI/bge-large-en-v1.5",
        encode_kwargs={"normalize_embeddings": True},
        query_encode_kwargs={
            "prompt": "Represent this sentence for searching relevant passages: ",
            "normalize_embeddings": True,
        },
    )
    
    return embeddings


@lru_cache(maxsize=1)
def bm25_embedder() -> SparseTextEmbedding:
    return SparseTextEmbedding(model_name="Qdrant/bm25")


def get_vectors(
    texts: Union[str, List[str]], 
    is_query: bool = False
) -> Tuple[
        Union[List[float], List[List[float]]], 
        Union[models.SparseVector, List[models.SparseVector]]
    ]:
    
    dense_model = bge_large_embedder()
    sparse_model = bm25_embedder()

    is_single = isinstance(texts, str)
    text_list = [texts] if is_single else texts

    # generate dense embeddings
    if is_query:
        dense_vectors = [dense_model.embed_query(t) for t in text_list]
    else:
        dense_vectors = dense_model.embed_documents(text_list)

    # generate sparse vector embeddings
    sparse_raw = list(sparse_model.embed(text_list))
    sparse_vectors = [
        models.SparseVector(
            indices=res.indices.tolist(),
            values=res.values.tolist()
        )
        for res in sparse_raw
    ]

    if is_single:
        return dense_vectors[0], sparse_vectors[0]
    
    return dense_vectors, sparse_vectors
