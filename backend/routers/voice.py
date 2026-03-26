from fastapi import APIRouter, HTTPException, Depends
import os
import httpx
from pydantic import BaseModel

router = APIRouter(prefix="/api/voice", tags=["Voice"])

class TTSRequest(BaseModel):
    text: str
    model: str = "aura-asteria-en"

@router.get("/key/")
async def get_voice_key():
    """Returns the Deepgram API key (or a short-lived token)."""
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not set")
    return {"key": key}

@router.post("/speak/")
async def text_to_speech(req: TTSRequest):
    """Proxies request to Deepgram TTS."""
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not set")
    
    url = f"https://api.deepgram.com/v1/speak?model={req.model}"
    headers = {
        "Authorization": f"Token {key}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json={"text": req.text})
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Deepgram TTS failed")
        
        # Return the audio as a streaming response or base64?
        # Base64 is easier for the frontend to handle in this specific architecture.
        import base64
        audio_b64 = base64.b64encode(resp.content).decode("utf-8")
        return {"audio": audio_b64}
