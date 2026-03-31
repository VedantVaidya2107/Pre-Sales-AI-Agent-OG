import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv(override=False)
key = os.environ.get("GEMINI_API_KEY")

if not key:
    print("GEMINI_API_KEY not found!")
    exit(1)

try:
    print(f"Using Key: {key[:5]}...{key[-5:]}")
    genai.configure(api_key=key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content("Hello, say 'Gemini Stable is online!'")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Gemini Stable Test Failed: {e}")
