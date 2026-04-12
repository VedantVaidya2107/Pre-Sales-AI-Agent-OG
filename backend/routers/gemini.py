import os
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
try:
    from google import genai
    from google.genai import types
    NEW_SDK_AVAILABLE = True
except ImportError:
    import google.generativeai as genai_old
    NEW_SDK_AVAILABLE = False
    logger.warning("⚠️ [Gemini] New google-genai SDK not found. Falling back to google-generativeai.")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gemini", tags=["Gemini"])

class GenerateRequest(BaseModel):
    prompt: str
    history: Optional[List[Dict[str, Any]]] = []
    systemInstruction: Optional[str] = ""
    maxTokens: int = 1000
    temperature: float = 0.7
    forcePro: bool = False

@router.get("/status")
async def get_status():
    """Checks Gemini API connectivity and model access with improved timeout and robustness."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {"status": "error", "message": "GEMINI_API_KEY missing from environment."}
    
    try:
        if NEW_SDK_AVAILABLE:
            client = genai.Client(api_key=api_key)
            model_list = list(client.models.list())
            models = [m.display_name for m in model_list if 'gemini' in m.name.lower()]
        else:
            genai_old.configure(api_key=api_key)
            model_list = genai_old.list_models()
            models = [m.display_name for m in model_list if 'gemini' in m.name.lower()]
        
        if not models:
             return {"status": "error", "message": "No generative models found."}
             
        return {
            "status": "ok", 
            "message": "AI Online",
            "models": models[:3] 
        }
    except Exception as e:
        logger.error(f"[AI Status] Verification failed: {str(e)}")
        return {"status": "error", "message": "API connectivity issue."}

@router.post("/generate")
def generate(req: GenerateRequest):
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        logger.error("[Gemini] API Key missing")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing")

    try:
        final_prompt = req.prompt.strip()
        is_json = req.forcePro or "json" in final_prompt.lower()
        if is_json and "JSON" not in final_prompt:
            final_prompt = "RETURN JSON ONLY. " + final_prompt

        # --- NEW SDK LOGIC ---
        if NEW_SDK_AVAILABLE:
            client = genai.Client(api_key=api_key)
            # Find best model
            model_list = list(client.models.list())
            available_names = [m.name for m in model_list if 'gemini' in m.name.lower()]
            priorities = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
            model_name = "gemini-1.5-flash"
            for p in priorities:
                match = next((name for name in available_names if p in name), None)
                if match:
                    model_name = match.replace("models/", "")
                    break

            # Config
            config = types.GenerateContentConfig(
                system_instruction=req.systemInstruction if req.systemInstruction else None,
                temperature=req.temperature,
                max_output_tokens=req.maxTokens,
                response_mime_type="application/json" if is_json else "text/plain"
            )

            # History
            history = []
            for msg in (req.history or []):
                role = "user" if msg.get("role") == "user" else "model"
                content = msg.get("content", "").strip()
                if content:
                    history.append(types.Content(role=role, parts=[types.Part(text=content)]))

            if history:
                chat = client.chats.create(model=model_name, history=history, config=config)
                response = chat.send_message(final_prompt)
            else:
                response = client.models.generate_content(model=model_name, contents=final_prompt, config=config)
            
            return {"text": response.text}

        # --- OLD SDK LOGIC (FALLBACK) ---
        else:
            genai_old.configure(api_key=api_key)
            model = genai_old.GenerativeModel(
                model_name="gemini-1.5-flash",
                system_instruction=req.systemInstruction if req.systemInstruction else None
            )
            
            # Simple simulation of history for old SDK
            chat = model.start_chat(history=[])
            for msg in (req.history or []):
                role = "user" if msg.get("role") == "user" else "model"
                chat.history.append({"role": role, "parts": [msg.get("content", "")]})
            
            response = chat.send_message(final_prompt, generation_config={
                "temperature": req.temperature,
                "max_output_tokens": req.maxTokens,
            })
            return {"text": response.text}

    except Exception as e:
        logger.error(f"[Gemini Exception] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
