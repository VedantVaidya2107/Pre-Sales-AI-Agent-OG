import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timezone

load_dotenv(dotenv_path="backend/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE_URL or SUPABASE_KEY")
    exit(1)

try:
    supabase = create_client(url, key)
    
    # Test record for clients table
    test_client = {
        "client_id": "TEST_LEAD_002",
        "company": "Test Company 2",
        "industry": "Technology",
        "email": "test2@example.com",
        "phone": "9876543210",
        "notes": "Test note 2",
        "size": "Medium",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    print(f"Attempting to insert client record: {test_client}")
    res = supabase.table("clients").insert(test_client).execute()
    print("Insert successful!")
    print(f"Data: {res.data}")
    
except Exception as e:
    print(f"Insert failed: {e}")
