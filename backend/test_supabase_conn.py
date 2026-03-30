import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

print(f"URL: {url}")
print(f"Key: {key[:10]}...")

if not url or not key:
    print("Error: Missing SUPABASE_URL or SUPABASE_KEY")
    exit(1)

try:
    supabase = create_client(url, key)
    res = supabase.table("agents").select("*").limit(1).execute()
    print("Supabase connection successful!")
    print(f"Data: {res.data}")
except Exception as e:
    print(f"Supabase connection failed: {e}")
