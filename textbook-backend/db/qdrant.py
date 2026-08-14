from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Document
from dotenv import load_dotenv
import os

load_dotenv()
url: str = os.environ.get("QDRANT_URL")
key: str = os.environ.get("QDRANT_API_KEY")

# connect to Qdrant Cloud
client = QdrantClient(
    url=url,
    api_key=key,
    cloud_inference=True
)