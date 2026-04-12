import asyncio
import websockets
import json

async def simulate_twilio():
    uri = "ws://localhost:8000/api/voice/ws?client_id=test"
    try:
        async with websockets.connect(uri) as ws:
            print("Connected to WebSocket.")
            
            # Send standard Twilio connection sequence
            start_event = {
                "event": "connected",
                "protocol": "Call",
                "version": "1.0.0"
            }
            await ws.send(json.dumps(start_event))
            
            start_event2 = {
                "event": "start",
                "start": {
                    "streamSid": "MZ...",
                    "callSid": "CA..."
                }
            }
            await ws.send(json.dumps(start_event2))
            print("Sent 'start' event.")
            
            while True:
                resp = await ws.recv()
                print("Received:", resp)
                
    except Exception as e:
        print("WebSocket Error:", str(e))

if __name__ == "__main__":
    asyncio.run(simulate_twilio())
