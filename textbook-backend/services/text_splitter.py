from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

def recursive_char_text_split(
    document: list[str], 
    chunk_size:int=100, 
    chunk_overlap:int=0,    
    metadatas: list[dict]=None,
    language: Language=None
    ):

    if language:
        splitter = RecursiveCharacterTextSplitter.from_language(
            language=language,
            chunk_size=chunk_size, 
            chunk_overlap=chunk_overlap
        )

    else:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, 
            chunk_overlap=chunk_overlap
        )
    
    chunks = splitter.create_documents(document, metadatas=metadatas)

    return chunks