"""Verify production Qdrant configuration and filtered queries, read-only by default."""

import argparse
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from qdrant_client import models

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def verify_collection(collection_name: str) -> dict:
    from services import indexing

    collection = indexing.validate_collection_configuration(collection_name)
    if collection.status == models.CollectionStatus.RED:
        raise ValueError("Qdrant collection health is red")

    # Synthetic vectors avoid model downloads/inference costs. A fresh tenant
    # scope exercises the same indexed filters as retrieval without reading any
    # user's payload, creating points, or changing existing documents.
    query_filter = models.Filter(must=[
        models.FieldCondition(key="user_id", match=models.MatchValue(value=str(uuid4()))),
        models.FieldCondition(key="notebook_id", match=models.MatchValue(value=str(uuid4()))),
        models.FieldCondition(key="document_id", match=models.MatchValue(value=str(uuid4()))),
    ])
    queries = [
        (indexing.DENSE_VECTOR_NAME, [1.0] + [0.0] * (indexing.DENSE_VECTOR_SIZE - 1)),
        (indexing.SPARSE_VECTOR_NAME, models.SparseVector(indices=[0], values=[1.0])),
    ]
    for name, vector in queries:
        result = indexing.client.query_points(
            collection_name=collection_name,
            query=vector,
            using=name,
            query_filter=query_filter,
            limit=1,
            with_payload=False,
            with_vectors=False,
        )
        if result.points:
            raise ValueError("Synthetic tenant scope unexpectedly returned points")

    return {
        "status": "passed",
        "collection": collection_name,
        "health": collection.status.value,
        "point_count": indexing.client.count(collection_name, exact=True).count,
        "vector_queries": [name for name, _ in queries],
        "payload_indexes": [index["field_name"] for index in indexing.DEFAULT_PAYLOAD_INDEXES],
        "notebook_tenant_index": True,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", default="textbook_chunks")
    parser.add_argument(
        "--provision",
        action="store_true",
        help="Create a missing collection/indexes first; never recreate collections or write points.",
    )
    args = parser.parse_args(argv)
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    if not os.environ.get("QDRANT_URL") or not os.environ.get("QDRANT_API_KEY"):
        print(json.dumps({"status": "failed", "error": "Set QDRANT_URL and QDRANT_API_KEY"}))
        return 1
    try:
        if args.provision:
            from services.indexing import init_connection

            init_connection(collection_name=args.collection)
        result = verify_collection(args.collection)
    except Exception as exc:
        # SDK errors can include remote responses/URLs. Keep credentials and
        # returned payloads out of deploy logs, including for ValueError.
        print(json.dumps({"status": "failed", "error": type(exc).__name__}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
