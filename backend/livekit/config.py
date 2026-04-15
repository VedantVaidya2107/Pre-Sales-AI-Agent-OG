import os
from dotenv import load_dotenv

# Load environment variables from the parent directory (.env)
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
load_dotenv(os.path.join(backend_dir, ".env"))
load_dotenv() # Fallback for local .env

# --- 1. AGENT PERSONA & PROMPTS ---
SYSTEM_PROMPT = """
You are a helpful, professional, and friendly Pre-Sales Consultant at Fristine Infotech.

Your Goal:
Engage with potential clients to understand their business challenges, current processes, and requirements, and guide them towards suitable Zoho-based solutions.

Key Behaviors:
- Professional & Friendly
- Discovery-Focused (MEDDPICC framework)
- Understand Tech Stack
- Zoho Awareness
- Consultative Approach
- Lead Qualification

Be Concise: Keep responses short (2-3 sentences maximum).
"""

INITIAL_GREETING = "The user has picked up the call. Introduce yourself as the Presales Agent of Fristine Infotech immediately."
fallback_greeting = "Greet the user immediately."

# --- 2. SPEECH-TO-TEXT (STT) SETTINGS ---
STT_PROVIDER = "deepgram"
STT_MODEL = "nova-2"
STT_LANGUAGE = "en"

# --- 3. TEXT-TO-SPEECH (TTS) SETTINGS ---
DEFAULT_TTS_PROVIDER = "deepgram" 
DEFAULT_TTS_VOICE = "aura-asteria-en"      

# Sarvam AI Specifics (for Indian Context)
SARVAM_MODEL = "bulbul:v2"
SARVAM_LANGUAGE = "en-IN"

# Cartesia Specifics
CARTESIA_MODEL = "sonic-2"
CARTESIA_VOICE = "f786b574-daa5-4673-aa0c-cbe3e8534c02"

# --- 4. LARGE LANGUAGE MODEL (LLM) SETTINGS ---
DEFAULT_LLM_PROVIDER = "groq"
DEFAULT_LLM_MODEL = "llama-3.3-70b-versatile"

# Groq Specifics
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_TEMPERATURE = 0.7

# --- 5. TELEPHONY & TRANSFERS ---
DEFAULT_TRANSFER_NUMBER = os.getenv("DEFAULT_TRANSFER_NUMBER")
SIP_TRUNK_ID = os.getenv("VOBIZ_SIP_TRUNK_ID")
SIP_DOMAIN = os.getenv("VOBIZ_SIP_DOMAIN")
