import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = None

if url and key:
    try:
        supabase = create_client(url, key)
        print("[Supabase] Client initialized successfully.")
    except Exception as e:
        print(f"[Supabase Error] Failed to initialize: {e}")
else:
    print("[Supabase Warning] Missing SUPABASE_URL or SUPABASE_ANON_KEY.")

def ensure_supabase():
    if supabase is None:
        raise Exception("Supabase client not initialized. Please check environment variables.")
    return supabase
