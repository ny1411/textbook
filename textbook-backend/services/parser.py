import pymupdf

def extract_text_with_pymupdf(pdf_bytes: bytes) -> str:
    # open a document
    doc = pymupdf.open(stream=pdf_bytes, filetype='pdf') 
    
    extracted_pages = []
    
    # extract text
    for page in doc:
        text = page.get_text()
        extracted_pages.append(text)
    doc.close()

    # join text
    full_text = "\n\n".join(extracted_pages)
    return full_text