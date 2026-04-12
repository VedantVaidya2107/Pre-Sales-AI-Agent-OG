import socket
import os
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
print(f"DEBUG: SUPABASE_URL = '{url}'")

if url:
    host = url.replace("https://", "").replace("http://", "").split("/")[0]
    print(f"DEBUG: Extracted Host = '{host}'")
    try:
        ip = socket.gethostbyname(host)
        print(f"SUCCESS: {host} resolved to {ip}")
    except Exception as e:
        print(f"FAILURE: Could not resolve {host}: {e}")
else:
    print("ERROR: SUPABASE_URL not found in .env")
