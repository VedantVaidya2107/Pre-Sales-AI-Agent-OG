import os
import sys
import socket
from importlib import import_module

def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def diagnose():
    print("==========================================")
    print("  Fristine Backend Diagnostic Tool")
    print("==========================================")
    
    # 1. Python Version
    print(f"\n[1/5] Python Version: {sys.version}")
    if sys.version_info < (3, 10):
        print("⚠️ Warning: Python 3.10+ is recommended for google-genai and pipecat.")

    # 2. Environment Variables
    print("\n[2/5] Checking Environment Variables...")
    required = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"]
    for var in required:
        val = os.environ.get(var)
        status = "✅ Found" if val else "❌ MISSING"
        print(f"  - {var}: {status}")

    # 3. Port Check
    print("\n[3/5] Checking Port 8000...")
    if check_port(8000):
        print("⚠️ Warning: Port 8000 is ALREADY IN USE. This will block the backend.")
    else:
        print("✅ Port 8000 is free.")

    # 4. Critical Imports
    print("\n[4/5] Testing Critical Imports...")
    libs = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("google.genai", "Google GenAI SDK"),
        ("pipecat", "Pipecat AI"),
        ("supabase", "Supabase Client")
    ]
    for lib, name in libs:
        try:
            import_module(lib)
            print(f"  - {name}: ✅ Installed")
        except ImportError as e:
            print(f"  - {name}: ❌ FAILED ({e})")

    # 5. Startup Test
    print("\n[5/5] Attempting to initialize FastAPI app...")
    try:
        sys.path.append(os.getcwd())
        from main import app
        print("✅ App successfully initialized in memory.")
    except Exception as e:
        print(f"❌ App initialization FAILED: {e}")
        import traceback
        traceback.print_exc()

    print("\n==========================================")
    print("  Diagnostic Complete")
    print("==========================================")

if __name__ == "__main__":
    diagnose()
