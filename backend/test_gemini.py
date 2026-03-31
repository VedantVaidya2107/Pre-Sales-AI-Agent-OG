import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("GEMINI_API_KEY")
if not key:
    print("ERROR: GEMINI_API_KEY is not set.")
    exit(1)

genai.configure(api_key=key)

# Test model availability
models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
print(f"Available models: {models}")

test_model = "gemini-2.0-flash"
print(f"\nTesting model: {test_model}...")

try:
    model = genai.GenerativeModel(test_model)
    response = model.generate_content("Hello, this is a test.")
    print(f"SUCCESS: {response.text}")
except Exception as e:
    print(f"FAILURE for {test_model}: {e}")
    # Try gemini-1.5-flash as fallback
    print(f"\nTesting fallback model: gemini-1.5-flash...")
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content("Hello, this is a test.")
        print(f"SUCCESS: {response.text}")
    except Exception as e2:
        print(f"FAILURE for gemini-1.5-flash: {e2}")
