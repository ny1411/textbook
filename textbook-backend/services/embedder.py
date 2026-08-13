from langchain_huggingface import HuggingFaceEmbeddings

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