import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.parser import extract_text_with_pymupdf

pdf_path = Path(__file__).resolve().parent.parent.parent / "ai-engineer.pdf"

def test_extract_text() -> str:
    assert pdf_path.exists(), f"Sample PDF not found at {pdf_path}"
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    extracted_data = extract_text_with_pymupdf(pdf_bytes)
    assert isinstance(extracted_data, str), "Extracted data should be a string"
    assert len(extracted_data) > 0, "Extracted data should not be empty"

    print(f"Successfully extracted {len(extracted_data)} characters from PDF.")
    print("Sample snippet:\n", extracted_data[:300])
    return extracted_data

if __name__ == "__main__":
    test_extract_text()