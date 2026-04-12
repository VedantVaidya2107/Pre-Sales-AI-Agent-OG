import uvicorn
import os
import sys

if __name__ == "__main__":
    # Ensure we are in the correct directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Starting server in {os.getcwd()}...")
    try:
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    except Exception as e:
        print(f"\nCRITICAL ERROR: Failed to start the server: {e}")
        import socket
        # Check if port is already in use
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', 8000)) == 0:
                print("PORT 8000 IS ALREADY IN USE. Please kill the existing process.")
        input("Press Enter to close this window...")
