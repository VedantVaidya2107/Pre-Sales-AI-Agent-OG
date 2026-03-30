import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timezone

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE_URL or SUPABASE_KEY")
    exit(1)

try:
    supabase = create_client(url, key)
    test_email = "test_agent_creation@fristinetech.com"
    record = {
        "email": test_email,
        "name": "Test Agent Creation",
        "password": "testpassword123",
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    print(f"Attempting to upsert record: {record}")
    res = supabase.table("agents").upsert(record).execute()
    print("Upsert successful!")
    print(f"Data: {res.data}")
    
    # Clean up
    # supabase.table("agents").delete().eq("email", test_email).execute()
    # print("Cleanup successful.")
    
except Exception as e:
    print(f"Upsert failed: {e}")
