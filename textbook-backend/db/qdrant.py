from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Document
from dotenv import load_dotenv
import os

load_dotenv()
url: str = os.environ.get("QDRANT_URL")
key: str = os.environ.get("QDRANT_API_KEY")
timeout_seconds = float(os.environ.get("QDRANT_TIMEOUT_SECONDS", "30"))

# connect to Qdrant Cloud
client = QdrantClient(
    url=url,
    api_key=key,
    cloud_inference=True,
    timeout=timeout_seconds,
)
