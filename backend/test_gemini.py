import os
import sys
from dotenv import load_dotenv
from google import genai

# Load environment variables from .env
load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")

if not api_key:
    print("❌ Error: GEMINI_API_KEY not found in .env")
    sys.exit(1)

print(f"Testing Gemini API with Key: {api_key[:5]}...{api_key[-5:]}")

try:
    client = genai.Client(api_key=api_key)
    # Try gemini-1.5-flash as it's more widely available
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Hello, this is a test from the Fristine AI Pre-Sales Architect. Respond with 'API_SUCCESS' if you receive this."
    )
    
    if "API_SUCCESS" in response.text:
        print("✅ Success: Gemini API is responding correctly!")
        print(f"Response: {response.text.strip()}")
    else:
        print("⚠️ Warning: Received response but it might be unexpected.")
        print(f"Response: {response.text.strip()}")


except Exception as e:
    print(f"❌ Error during API call: {e}")
    sys.exit(1)
