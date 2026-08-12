from supabase import Client, create_client
from dotenv import load_dotenv
import os

# load .env
load_dotenv()
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("Missing supabase credentials in .env")

# create client
supabase_client: Client = create_client(url, key)