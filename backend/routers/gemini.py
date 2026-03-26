import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from google import genai

router = APIRouter(prefix="/api/gemini", tags=["Gemini"])

class GenerateRequest(BaseModel):
    prompt: str
    history: Optional[List[Dict[str, Any]]] = []
    systemInstruction: Optional[str] = ""
    maxTokens: int = 1000
    temperature: float = 0.7
    forcePro: bool = False


@router.post("/generate")
def generate(req: GenerateRequest):
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY environment variable not set"
        )

    try:
        client = genai.Client(api_key=api_key)

        # 🔁 Model selection logic (same as your current logic)
        model_name = (
            "gemini-2.5-pro"
            if req.forcePro
            or "json" in req.prompt.lower()
            or "generate proposal" in req.prompt.lower()
            else "gemini-2.5-flash"
        )

        from google.genai import types

        # Build config
        config = types.GenerateContentConfig(
            temperature=req.temperature,
            max_output_tokens=req.maxTokens,
            system_instruction=req.systemInstruction if req.systemInstruction else None
        )

        # 🧠 Build conversation context
        contents = []

        # Add history
        for msg in (req.history or []):
            role = "user" if msg.get("role", "user") == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content", ""))]
                )
            )

        # Final prompt modification (JSON enforcement)
        final_prompt = req.prompt
        if req.forcePro or "json" in req.prompt.lower():
            final_prompt = (
                "CRITICAL: YOU MUST RETURN ONLY VALID JSON. "
                "NO MARKDOWN. NO PREAMBLE.\n\n" + req.prompt
            )

        if contents and contents[-1].role == "user":
            contents[-1].parts.append(types.Part.from_text(text="\n\n" + final_prompt))
        else:
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=final_prompt)]
                )
            )

        # 🚀 Generate response
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config
        )

        text = response.text if hasattr(response, "text") else ""

        return {"text": text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
