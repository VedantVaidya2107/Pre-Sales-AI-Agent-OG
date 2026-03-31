import os
from google import genai
from dotenv import load_dotenv

# Load .env from backend directory
env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
load_dotenv(env_path)

def test():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print(f"GEMINI_API_KEY not found in {env_path}")
        return
    
    print(f"Using API Key: {api_key[:5]}...{api_key[-5:]}")
    
    try:
        client = genai.Client(api_key=api_key)
        models = list(client.models.list())
        
        if not models:
            print("No models found")
            return
        
        m = models[0]
        print(f"\n--- Model Debug: {m.name} ---")
        print(f"Repr: {repr(m)}")
        print(f"Dict: {m.__dict__}")
        
        # Test common names for supported methods
        attrs = [a for a in dir(m) if not a.startswith('_')]
        print(f"Attributes: {attrs}")
        
        # Test common names for supported methods
        found_methods = False
        for attr in ['supported_methods', 'supported_generation_methods', 'capabilities', 'methods']:
            if hasattr(m, attr):
                val = getattr(m, attr)
                print(f"MATCH: {attr} = {val}")
                found_methods = True
        
        if not found_methods:
            print("None of the standard capability attributes were found.")
            
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    test()
