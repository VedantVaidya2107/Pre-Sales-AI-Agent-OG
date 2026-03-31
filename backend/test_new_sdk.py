from google import genai
import os
from dotenv import load_dotenv

load_dotenv("backend/.env")
api_key = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=api_key)

try:
    print("Testing new google.genai SDK...")
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents="Hello, are you there?"
    )
    print("Response:", response.text)
except Exception as e:
    print("New SDK Error:", e)
