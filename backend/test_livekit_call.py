import requests
import sys

def test_call(phone):
    url = "http://localhost:8000/api/voice/livekit-call"
    payload = {"phone": phone}
    
    print(f"📡 Sending LiveKit call request to {phone}...")
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            data = response.json()
            print("✅ Success!")
            print(f"   Dispatch ID: {data.get('dispatch_id')}")
            print(f"   Room: {data.get('room')}")
        else:
            print(f"❌ Failed (Status: {response.status_code})")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_livekit_call.py +91XXXXXXXXXX")
    else:
        test_call(sys.argv[1])
