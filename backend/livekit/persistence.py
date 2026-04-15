import os
import sys
import json
import logging
from datetime import datetime, timezone
from openai import AsyncOpenAI

# Inject backend directory into sys.path to allow imports from utils
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from utils.supabase_client import supabase, ensure_supabase

logger = logging.getLogger("persistence")

# Prompt for generating technical proposals from discovery transcripts
PROPOSAL_PROMPT = """
You are a Senior Pre-Sales Architect. I will provide you with a transcript of a discovery call with a potential client.
Your task is to analyze the conversation and generate a professional, high-fidelity Technical Proposal in HTML format.

The proposal MUST include the following sections based on the MEDDPICC framework:
1. Executive Summary
2. Identified Pain Points
3. Current Tech Stack (CRM, Cloud, ERP, etc.)
4. Strategic Solution (Focus on Zoho Ecosystem)
5. Success Metrics (What does 'good' look like?)
6. Next Steps & Implementation Roadmap

STYLING GUIDELINES:
- Use clean, modern HTML with inline styles or Tailwind-like classes (using standard tags).
- Use a professional color palette (Dark blue, Slate, White).
- Use clear headings and bullet points.
- Do NOT include <html> or <body> tags, just the content inside.
- If certain information was NOT discussed in the call, use professional placeholders or mark it as "To be validated in next session".

TRANSCRIPT:
{transcript}

CLIENT ID: {client_id}
"""

async def generate_and_save_call_proposal(client_id: str, transcript: str):
    """
    Summarizes the call transcript using an LLM and saves it to Supabase.
    """
    if not client_id or not transcript:
        logger.warning("Missing client_id or transcript. Skipping proposal generation.")
        return

    try:
        logger.info(f"Generating proposal for client: {client_id}")
        
        # 1. Initialize Groq (via OpenAI client)
        api_key = os.getenv("GROQ_API_KEY")
        model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        
        if not api_key:
            logger.error("GROQ_API_KEY not found. Cannot generate proposal.")
            return

        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1"
        )

        # 2. Call LLM
        response = await client.chat.completions.create(
            model=model,
            messages=[{
                "role": "system",
                "content": PROPOSAL_PROMPT.format(transcript=transcript, client_id=client_id)
            }],
            temperature=0.3
        )

        proposal_html = response.choices[0].message.content
        
        # 3. Handle Supabase Persistence
        ensure_supabase()
        
        # Get latest version for this client
        res_last = supabase.table("proposals")\
            .select("version")\
            .eq("client_id", client_id)\
            .order("version", desc=True)\
            .limit(1)\
            .execute()
            
        last_v = res_last.data[0]["version"] if res_last.data else 0
        new_v = last_v + 1
        
        title = f"Call Proposal (MEDDPICC Discovery) v{new_v}"
        
        data = {
            "client_id": client_id,
            "version": new_v,
            "proposal_html": proposal_html,
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # 4. Insert into DB
        res = supabase.table("proposals").insert(data).execute()
        
        if res.data:
            logger.info(f"✅ Successfully saved call proposal v{new_v} for client {client_id}")
        else:
            logger.error("❌ Failed to save proposal to Supabase")

    except Exception as e:
        logger.error(f"❌ Error in generate_and_save_call_proposal: {e}")
