import os
import asyncio
from dotenv import load_dotenv
from livekit import api

# Load env from parent dir
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
load_dotenv(os.path.join(backend_dir, ".env"))

async def check_livekit():
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    
    print(f"URL: {url}")
    print(f"Key: {api_key}")
    
    if url.startswith("wss://"):
        url = url.replace("wss://", "https://")
    
    try:
        client = api.LiveKitAPI(url, api_key, api_secret)
        rooms = await client.room.list_rooms(api.ListRoomsRequest())
        print(f"Successfully connected! Found {len(rooms.rooms)} rooms.")
        await client.aclose()
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    asyncio.run(check_livekit())
