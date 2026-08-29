import sys
import logging
import pymupdf
from pathlib import Path
from langchain_core.documents import Document

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from db.qdrant import client
from services.ingestion import ingest_chunks
from services.text_splitter import recursive_char_text_split
from rich.console import Console

logger = logging.getLogger(__name__)

console = Console()
COLLECTION_NAME = "textbook_chunks"
PDF_PATH = Path(__file__).resolve().parent.parent.parent / "ai-engineer.pdf"


def seed_pdf_corpus(
    pdf_path: Path = PDF_PATH,
    user_id: str = "eval_test_user",
    document_id: str = "ai_engineer_handbook"
):
    if not pdf_path.exists():
        console.print(f"[red]PDF not found: {pdf_path}[/red]")
        return
    
    console.print(f"[blue]Extracting text from {pdf_path.name}[/blue]")
    doc = pymupdf.open(str(pdf_path))

    documents = []
    for page_idx, page in enumerate(doc, start=1):
        text = page.get_text()
        if text.strip():
            documents.append(
                Document(
                    page_content=text,
                    metadata={
                        "source": document_id,
                        "document_id": document_id,
                        "page": page_idx,
                        "title": pdf_path.stem,
                    }
                )
            )
    doc.close()
    console.print(f"[green]Extracted {len(documents)} pages from {pdf_path.name}[/green]")

    all_chunks = []
    for d in documents:
        chunks = recursive_char_text_split(
            document=[d.page_content],
            chunk_size=500,
            chunk_overlap=50,
            metadatas=[d.metadata]
        )
        all_chunks.extend(chunks)
    
    console.print(f"[blue]Generating vectors and ingesting {len(all_chunks)} chunks into Qdrant...[/blue]")
    ingest_chunks(chunks=all_chunks, user_id=user_id)

    info = client.get_collection(COLLECTION_NAME)
    console.print(f"[bold green]Seeding Complete! Total points in Qdrant: {info.points_count}[/bold green]")


if __name__ == "__main__":
    seed_pdf_corpus()