from fastapi import APIRouter, HTTPException, Depends, Request, WebSocket, Response
from fastapi.responses import HTMLResponse

import os
import httpx
from pydantic import BaseModel
from twilio.rest import Client as TwilioClient
# from src.pipecat_bot import start_frc_bot

from loguru import logger

router = APIRouter(prefix="/api/voice", tags=["Voice"])

class TTSRequest(BaseModel):
    text: str
    model: str = "aura-asteria-en"

class CallRequest(BaseModel):
    phone: str
    client_id: str = None

@router.get("/status")
async def get_voice_status():
    """Checks Deepgram API connectivity."""
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        return {"status": "error", "message": "DEEPGRAM_API_KEY missing from environment."}
    
    url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en"
    headers = {"Authorization": f"Token {key}", "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json={"text": "ping"}, timeout=5.0)
            if resp.status_code == 200:
                return {"status": "ok", "message": "Voice Online"}
            else:
                return {"status": "error", "message": f"Deepgram Error ({resp.status_code})"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/key")
async def get_voice_key():
    """Returns the Deepgram API key (or a short-lived token)."""
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not set")
    return {"key": key}

@router.post("/speak")
async def text_to_speech(req: TTSRequest):
    """Proxies request to Deepgram TTS."""
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="DEEPGRAM_API_KEY not set")
    
    clean_text = (req.text or "").strip()
    if not clean_text:
        return {"audio": None, "warning": "Empty text provided"}

    url = f"https://api.deepgram.com/v1/speak?model={req.model}"
    headers = {"Authorization": f"Token {key}", "Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json={"text": clean_text}, timeout=30.0)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Deepgram TTS failed")
            
            import base64
            audio_b64 = base64.b64encode(resp.content).decode("utf-8")
            return {"audio": audio_b64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/twiml")
async def get_twiml(request: Request, client_id: str = None):
    """Returns TwiML for connecting the call to our Pipecat WebSocket."""
    import os
    base_url = os.environ.get("BASE_URL")
    if base_url:
        # e.g. https://domain.trycloudflare.com -> wss://domain.trycloudflare.com
        ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://").rstrip('/') + "/api/voice/ws"
    else:
        host = request.headers.get("host") or ""
        ws_scheme = "wss" if ("ngrok" in host or "loca.lt" in host or "trycloudflare" in host or request.url.scheme == "https") else "ws"
        ws_url = f"{ws_scheme}://{host}/api/voice/ws"
        
    if client_id:
        ws_url += f"?client_id={client_id}"
    
    logger.info(f"[Twilio] Generating TwiML for WebSocket: {ws_url} (Client: {client_id})")
    
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="{ws_url}" /></Connect></Response>'
    return Response(content=twiml, media_type="text/xml")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client_id: str = None):
    """Handle the Twilio Media Stream via Pipecat."""
    await websocket.accept()
    logger.info(f"[WebSocket] Accepted Twilio Media Stream connection (Client: {client_id})")
    
    # Wait for the first message from Twilio (the 'start' message)
    import json
    try:
        message = await websocket.receive_text()
        data = json.loads(message)
        if data.get("event") == "start":
            stream_id = data["start"]["streamSid"]
            call_id = data["start"]["callSid"]
            logger.info(f"[WebSocket] Stream started: {stream_id} for Call: {call_id}")
            
            # Start the Pipecat Bot (Lazy Import)
            from src.pipecat_bot import start_frc_bot
            await start_frc_bot(websocket, stream_id, call_id, client_id=client_id)

        else:
            logger.warning(f"[WebSocket] Expected 'start' event, got: {data.get('event')}")
    except Exception as e:
        logger.error(f"[WebSocket] Error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

@router.post("/call")
async def make_call(req: CallRequest, request: Request):
    """Initiates a Twilio Call using the Pipecat flow."""
    logger.info(f"[Twilio] Received call request for: {req.phone}")
    
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_number = os.environ.get("TWILIO_FROM_NUMBER")
    
    # Priority: BASE_URL env > Request Host
    base_url = os.environ.get("BASE_URL")
    if not base_url:
        host = request.headers.get("host")
        scheme = request.url.scheme
        base_url = f"{scheme}://{host}"
        logger.warning(f"[Twilio] BASE_URL not found in env, using request host: {base_url}")
    else:
        logger.info(f"[Twilio] Using configured BASE_URL: {base_url}")

    if not all([account_sid, auth_token, from_number]):
        missing = [k for k, v in {"SID": account_sid, "Token": auth_token, "From": from_number}.items() if not v]
        logger.error(f"[Twilio] Missing credentials: {missing}")
        raise HTTPException(status_code=500, detail=f"Twilio credentials missing: {missing}")
    
    try:
        client = TwilioClient(account_sid, auth_token)
        twiml_url = f"{base_url.rstrip('/')}/api/voice/twiml"
        if req.client_id:
            twiml_url += f"?client_id={req.client_id}"
        
        logger.info(f"[Twilio] Creating call to {req.phone} from {from_number} (TwiML: {twiml_url})")
        
        call = client.calls.create(
            url=twiml_url,
            to=req.phone,
            from_=from_number
        )
        logger.success(f"[Twilio] Call created! SID: {call.sid}")
        return {"success": True, "call_sid": call.sid}
    except Exception as e:
        err_msg = str(e)
        logger.error(f"[Twilio] Call creation failed: {err_msg}")
        
        # Check for trial account restrictions (Error 21219)
        if "21219" in err_msg or "verified" in err_msg.lower():
            raise HTTPException(
                status_code=400, 
                detail={
                    "code": 21219,
                    "error": "Twilio Trial Restriction: This phone number is not verified in your Twilio Console.",
                    "suggestion": "Go to Twilio > Phone Numbers > Verified Caller IDs to add this number."
                }
            )
            
        raise HTTPException(status_code=500, detail=f"Twilio error: {err_msg}")
