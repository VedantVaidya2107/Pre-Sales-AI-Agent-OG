from google import genai
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
api_key = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=api_key)

try:
    print("Testing gemini-2.0-flash with new SDK...")
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Research 'Acme Corp' (Manufacturing). Return JSON with fields: industries, size, pain_points (array of 3)."
    )
    print("Response Received:", response.text)
except Exception as e:
    print("Final SDK Test Error:", str(e))
