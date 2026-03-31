import requests
import base64
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

def test_tts():
    url = "http://localhost:8000/api/voice/speak"
    payload = {"text": "Hello, this is a test of the Fristine Pre-Sales Agent voice system."}
    
    print(f"Testing TTS at {url}...")
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            data = response.json()
            audio_b64 = data.get("audio")
            if audio_b64:
                print(f"Success! Received {len(audio_b64)} bytes of audio data.")
                # Save to file to verify
                with open("test_audio.wav", "wb") as f:
                    f.write(base64.b64decode(audio_b64))
                print("Audio saved to test_audio.wav")
            else:
                print("Error: No audio in response.")
        else:
            print(f"Error: Status code {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_tts()
