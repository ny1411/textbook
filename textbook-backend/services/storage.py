from db.supabase import supabase_client

"""
Example parameters:
bucket_name='textbook-documents'
file_path='sample.pdf'
"""

# import the pdf from supabase bucket
def download_pdf_from_supabase(bucket_name: str, file_path:str):
    pdf_bytes = supabase_client.storage.from_(bucket_name).download(f'{file_path}')
    return pdf_bytes