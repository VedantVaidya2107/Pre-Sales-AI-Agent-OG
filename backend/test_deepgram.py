import os
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv(override=False)
key = os.environ.get("DEEPGRAM_API_KEY")

async def test_deepgram():
    if not key:
        print("DEEPGRAM_API_KEY not found!")
        return
    
    print(f"Using Key: {key[:5]}...{key[-5:]}")
    url = "https://api.deepgram.com/v1/projects"
    headers = {"Authorization": f"Token {key}"}
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            print("Deepgram Key is VALID!")
        else:
            print(f"Deepgram Key Failed: {resp.status_code} {resp.text}")

if __name__ == "__main__":
    asyncio.run(test_deepgram())
