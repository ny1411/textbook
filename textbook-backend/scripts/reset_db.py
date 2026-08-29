import sys
import logging
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from db.qdrant import client
from services.indexing import init_connection
from rich.console import Console

logger = logging.getLogger(__name__)

console = Console()
COLLECTION_NAME = "textbook_chunks"

def reset_qdrant(collection_name: str = COLLECTION_NAME):
    console.log(f"[yellow]Checking Qdrant collection: '{collection_name}'[/yellow]")
    
    try:
        if client.collection_exists(collection_name):
            client.delete_collection(collection_name)
            console.log(f"[red]Deleted collection: '{collection_name}'[/red]")
            logger.info(f"Deleted collection: '{collection_name}'")
        init_connection(collection_name=collection_name)
        console.log(f"[green]Recreated collection: '{collection_name}' with HNSW & Payload Indexes[/green]")
        logger.info(f"Recreated collection with HNSW & Payload Indexes: '{collection_name}'")
    except Exception as e:
        console.log(f"[red]Error resetting Qdrant: {e}[/red]")
        logger.error(f"Error resetting Qdrant: {e}")

if __name__ == "__main__":
    reset_qdrant()