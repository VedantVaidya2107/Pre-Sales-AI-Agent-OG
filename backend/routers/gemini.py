import os
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from google import genai
from google.genai import types

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
        # Using a small timeout for the health check to avoid UI lag
        client = genai.Client(api_key=api_key)
        
        # We don't necessarily need to list all models; just one successful metadata fetch or model access is enough.
        # But for UIbrevity, we'll keep listing but with a faster check.
        model_list = list(client.models.list())
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
        # If model listing fails but we have a key, we might still be 'Online' 
        # but just restricted. We'll return error to be safe and notify user.
        return {"status": "error", "message": "API connectivity issue."}

@router.post("/generate")
def generate(req: GenerateRequest):
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        logger.error("[Gemini] API Key missing")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing")

    try:
        # Initialize the NEW official SDK client
        client = genai.Client(api_key=api_key)

        # DYNAMIC MODEL SELECTION: Pick the best available model for this API key.
        model_list = list(client.models.list())
        available_names = [m.name for m in model_list if 'gemini' in m.name.lower()]
        
        # Priority list
        priorities = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-pro"]
        model_name = None 
        
        for p in priorities:
            match = next((name for name in available_names if p in name), None)
            if match:
                model_name = match
                break
        
        if not model_name:
            if available_names:
                model_name = available_names[0]
                logger.info(f"[Gemini] Preferred models not found. Using first available: {model_name}")
            else:
                model_name = "gemini-2.5-flash"
                logger.warning(f"[Gemini] No models detected. Defaulting to: {model_name}")
        
        # Clean the model name (remove 'models/' prefix if present from list())
        if model_name and "models/" in model_name:
            model_name = model_name.replace("models/", "")

        logger.info(f"[Gemini] Final selected model: {model_name}")
        
        logger.info(f"[Gemini] Dynamically selected model: {model_name} from {available_names}")
        
        # Determine if we need to force JSON
        final_prompt = req.prompt.strip()
        is_json = req.forcePro or "json" in final_prompt.lower()
        
        if is_json and "JSON" not in final_prompt:
            final_prompt = "RETURN JSON ONLY. " + final_prompt

        # Handle History conversion for the new SDK
        history = []
        for msg in (req.history or []):
            role = "user" if msg.get("role") == "user" else "model"
            content = msg.get("content", "").strip()
            if content:
                history.append(types.Content(role=role, parts=[types.Part(text=content)]))

        # Config for generation
        config = types.GenerateContentConfig(
            system_instruction=req.systemInstruction if req.systemInstruction else None,
            temperature=req.temperature,
            max_output_tokens=req.maxTokens,
            response_mime_type="application/json" if is_json else "text/plain"
        )

        try:
            # Start chat or single generation
            if history:
                chat = client.chats.create(model=model_name, history=history, config=config)
                response = chat.send_message(final_prompt)
            else:
                response = client.models.generate_content(
                    model=model_name,
                    contents=final_prompt,
                    config=config
                )
        except Exception as api_err:
             logger.error(f"[Gemini API Error] {str(api_err)}")
             # Fallback to 1.5 if 2.0 fails
             fallback_model = "gemini-1.5-flash"
             logger.info(f"Retrying with {fallback_model}...")
             response = client.models.generate_content(
                    model=fallback_model,
                    contents=final_prompt,
                    config=config
                )

        if not response or not response.text:
             logger.warning("[Gemini] Empty response")
             return {"text": ""}

        return {"text": response.text}

    except Exception as e:
        logger.error(f"[Gemini Exception] {str(e)}")
        # Check for specific 404/availability errors to give better feedback
        err_msg = str(e)
        if "404" in err_msg or "not found" in err_msg.lower():
            err_msg = f"Model availability issue: {err_msg}. Please check your API key's model access list."
        raise HTTPException(status_code=500, detail=err_msg)
