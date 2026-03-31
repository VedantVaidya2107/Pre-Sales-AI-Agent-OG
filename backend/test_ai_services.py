import os
import google.generativeai as genai
import requests
from dotenv import load_dotenv

load_dotenv()

def test_gemini():
    print("--- TESTING GEMINI ---")
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        print("FAIL: GEMINI_API_KEY missing")
        return
    
    genai.configure(api_key=key)
    try:
        # Check available models
        models = [m.name for m in genai.list_models() if "generateContent" in m.supported_generation_methods]
        print(f"Models: {models}")
        
        # Test 2.0 Flash
        target = "gemini-2.0-flash"
        model = genai.GenerativeModel(target)
        resp = model.generate_content("hello")
        print(f"SUCCESS {target}: {resp.text[:20]}...")
    except Exception as e:
        print(f"FAIL Gemini: {e}")

def test_deepgram():
    print("\n--- TESTING DEEPGRAM ---")
    key = os.getenv("DEEPGRAM_API_KEY")
    if not key:
        print("FAIL: DEEPGRAM_API_KEY missing")
        return
    
    try:
        url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en"
        headers = {"Authorization": f"Token {key}", "Content-Type": "application/json"}
        resp = requests.post(url, headers=headers, json={"text": "test"}, timeout=5)
        if resp.status_code == 200:
            print("SUCCESS Deepgram: Connection OK")
        else:
            print(f"FAIL Deepgram: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"FAIL Deepgram Connection: {e}")

if __name__ == "__main__":
    test_gemini()
    test_deepgram()
