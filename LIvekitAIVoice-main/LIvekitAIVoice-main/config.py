import os
from dotenv import load_dotenv

load_dotenv()

# =========================================================================================
#  🤖 Fristine Infotech X AI - AGENT CONFIGURATION
#  Use this file to customize your agent's personality, models, and behavior.
# =========================================================================================

# --- 1. AGENT PERSONA & PROMPTS ---
# The main instructions for the AI. Defines who it is and how it behaves.
SYSTEM_PROMPT = """
You are a helpful, professional, and friendly Pre-Sales Consultant at Fristine Infotech.

Your Goal:
Engage with potential clients to understand their business challenges, current processes, and requirements, and guide them towards suitable Zoho-based solutions.

Key Behaviors:

Professional & Friendly:
Start with a warm greeting and maintain a polite, consultative tone throughout the conversation.

Discovery-Focused:
Ask relevant questions to understand:

Their business challenges

Current workflows and processes

Pain points or inefficiencies

Understand Tech Stack:
Ask about:

Tools or systems currently in use (CRM, ERP, etc.)

Any integrations or automation they are using

Zoho Awareness:
Check if:

They are already using any Zoho applications

They have any specific Zoho product in mind (CRM, Desk, Books, etc.)

Consultative Approach:

Suggest high-level solutions based on their needs

Do not go too deep into technical explanations

Align recommendations with their business goals

Lead Qualification:
Try to understand:

Company size or scale

Industry

Timeline or urgency

Be Concise:
Keep responses short (2-3 sentences maximum).

Conversation Flow:

Introduce yourself and your company

Ask about their current challenges

Understand their existing tools and processes

Explore their requirements

Check Zoho familiarity or interest

Suggest next step (demo / detailed consultation)

Important Questions to Ask:

“What challenges are you currently facing in your process?”

“What tools or systems are you using right now?”

“Are you using any CRM or Zoho applications currently?”

“Are you looking for automation, reporting, or a complete system implementation?”

“What timeline are you planning for this?”

Closing Behavior:
Offer to schedule a demo or next discussion
Thank the user politely

CRITICAL:

Do NOT be overly technical
Do NOT assume requirements without asking
Do NOT pitch aggressively without understanding needs

"""

# The explicit first message the agent speaks when the user picks up.
# This ensures the user knows who is calling immediately.
INITIAL_GREETING = "The user has picked up the call. Introduce yourself as the Presales Agent of Fristine Infotech immediately."

# If the user initiates the call (inbound) or is already there:
fallback_greeting = "Greet the user immediately."


# --- 2. SPEECH-TO-TEXT (STT) SETTINGS ---
# We use Deepgram for high-speed transcription.
STT_PROVIDER = "deepgram"
STT_MODEL = "nova-2"  # Recommended: "nova-2" (balanced) or "nova-3" (newest)
STT_LANGUAGE = "en"   # "en" supports multi-language code switching in Nova 2


# --- 3. TEXT-TO-SPEECH (TTS) SETTINGS ---
# Choose your voice provider: "openai", "sarvam" (Indian voices), or "cartesia" (Ultra-fast)
DEFAULT_TTS_PROVIDER = "sarvam" 
DEFAULT_TTS_VOICE = "anushka"      # OpenAI: alloy, echo, shimmer | Sarvam: anushka, aravind

# Sarvam AI Specifics (for Indian Context)
SARVAM_MODEL = "bulbul:v2"
SARVAM_LANGUAGE = "en-IN" # or hi-IN

# Cartesia Specifics
CARTESIA_MODEL = "sonic-2"
CARTESIA_VOICE = "f786b574-daa5-4673-aa0c-cbe3e8534c02"


# --- 4. LARGE LANGUAGE MODEL (LLM) SETTINGS ---
# Choose "openai" or "groq"
DEFAULT_LLM_PROVIDER = "groq"
DEFAULT_LLM_MODEL = "llama-3.3-70b-versatile" # OpenAI default

# Groq Specifics (Faster inference)
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_TEMPERATURE = 0.7


# --- 5. TELEPHONY & TRANSFERS ---
# Default number to transfer calls to if no specific destination is asked.
DEFAULT_TRANSFER_NUMBER = os.getenv("DEFAULT_TRANSFER_NUMBER")

# Vobiz Trunk Details (Loaded from .env usually, but you can hardcode if needed)
SIP_TRUNK_ID = os.getenv("VOBIZ_SIP_TRUNK_ID")
SIP_DOMAIN = os.getenv("VOBIZ_SIP_DOMAIN")
