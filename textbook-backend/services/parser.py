import pymupdf
import logging

logger = logging.getLogger(__name__)

def extract_text_with_pymupdf(file_bytes: bytes, filename: str, content_type: str) -> str:
    file_type = filename.split(".")[-1].lower() if "." in filename else ""

    if content_type == "application/pdf" or file_type == "pdf":
        doc = pymupdf.open(stream=file_bytes, filetype='pdf') 
        
        extracted_pages = []
        
        for page in doc:
            logger.info("Extracting pages.")
            text = page.get_text()
            extracted_pages.append(text)
        doc.close()

        # join text
        full_text = "\n\n".join(extracted_pages)
        return full_text

    try: 
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        logger.error("File is not in UTF-8 format.")
        return file_bytes.decode("latin-1", errors="ignore")