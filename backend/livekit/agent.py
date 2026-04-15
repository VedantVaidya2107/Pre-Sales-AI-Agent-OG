import os
import certifi

# Fix for macOS SSL Certificate errors - MUST be before other imports
os.environ['SSL_CERT_FILE'] = certifi.where()

import logging
import json
import sys
from dotenv import load_dotenv

# Ensure the backend directory is in the path for config and utils imports
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)

for path in [current_dir, backend_dir]:
    if path not in sys.path:
        sys.path.insert(0, path) # Use insert(0) to prioritize local paths

import asyncio
from livekit import agents, api, rtc
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import openai, deepgram, silero
from livekit.agents import llm
from typing import Annotated, Optional

# Optional plugins - gracefully degrade if not installed
try:
    from livekit.plugins import cartesia
except ImportError:
    cartesia = None
    logging.warning("livekit-plugins-cartesia not installed. Cartesia TTS unavailable.")

try:
    from livekit.plugins import noise_cancellation
except ImportError:
    noise_cancellation = None
    logging.warning("livekit-plugins-noise-cancellation not installed. NC unavailable.")

try:
    from livekit.plugins import sarvam
except ImportError:
    sarvam = None
    logging.warning("livekit-plugins-sarvam not installed. Sarvam TTS unavailable.")

# Load environment variables (check both backend/ and backend/livekit/ directories)
load_dotenv(os.path.join(backend_dir, ".env"))  # backend/.env (primary)
load_dotenv(".env")  # fallback for local .env if it exists

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("outbound-agent")

# Import config from the local directory
import config

def _build_tts(config_provider: str = None, config_voice: str = None):
    """Configure the Text-to-Speech provider based on env vars or dynamic config."""
    # Priority: Config > Env Var > Default
    provider = (config_provider or os.getenv("TTS_PROVIDER", config.DEFAULT_TTS_PROVIDER)).lower()

    if provider == "cartesia":
        logger.info("Using Cartesia TTS")
        model = os.getenv("CARTESIA_TTS_MODEL", config.CARTESIA_MODEL)
        voice = os.getenv("CARTESIA_TTS_VOICE", config.CARTESIA_VOICE)
        return cartesia.TTS(model=model, voice=voice)
    
    if provider == "sarvam":
        logger.info(f"Using Sarvam TTS (Voice: {config_voice})")
        model = os.getenv("SARVAM_TTS_MODEL", config.SARVAM_MODEL)
        # Use dynamic voice or env var or default
        voice = config_voice or os.getenv("SARVAM_VOICE", "anushka")
        language = os.getenv("SARVAM_LANGUAGE", config.SARVAM_LANGUAGE)
        return sarvam.TTS(model=model, speaker=voice, target_language_code=language)

    if provider == "deepgram":
        logger.info("Using Deepgram TTS")
        model = os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en")
        return deepgram.TTS(model=model)

    # Default to OpenAI
    logger.info(f"Using OpenAI TTS (Voice: {config_voice})")
    model = os.getenv("OPENAI_TTS_MODEL", "tts-1")
    voice = config_voice or os.getenv("OPENAI_TTS_VOICE", config.DEFAULT_TTS_VOICE)
    return openai.TTS(model=model, voice=voice)


def _build_llm(config_provider: str = None):
    """Configure the LLM provider based on config or env vars."""
    provider = (config_provider or os.getenv("LLM_PROVIDER", config.DEFAULT_LLM_PROVIDER)).lower()

    if provider == "groq":
        logger.info("Using Groq LLM")
        return openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=os.getenv("GROQ_MODEL", config.GROQ_MODEL),
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(config.GROQ_TEMPERATURE))),
        )
    
    # Default to OpenAI
    logger.info("Using OpenAI LLM")
    return openai.LLM(model=config.DEFAULT_LLM_MODEL)



class TransferFunctions(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, phone_number: str = None):
        super().__init__(tools=[])
        self.ctx = ctx
        self.phone_number = phone_number

    @llm.function_tool(description="Look up user details by phone number.")
    def lookup_user(self, phone: str):
        """
        Mock function to look up user details.

        Args:
            phone: The phone number to look up
        """
        logger.info(f"Looking up user: {phone}")
        return f"User found: Shreyas Raj. Status: Premium. Last order: Coffee setup (Delivered)."

    @llm.function_tool(description="Transfer the call to a human support agent or another phone number.")
    async def transfer_call(self, destination: Optional[str] = None):
        """
        Transfer the call.
        """
        if destination is None:
            destination = config.DEFAULT_TRANSFER_NUMBER
            if not destination:
                 return "Error: No default transfer number configured."
        if "@" not in destination:
            # If no domain is provided, append the SIP domain
            if config.SIP_DOMAIN:
                # Ensure clean number (strip tel: or sip: prefix if present but no domain)
                clean_dest = destination.replace("tel:", "").replace("sip:", "")
                destination = f"sip:{clean_dest}@{config.SIP_DOMAIN}"
            else:
                # Fallback to tel URI if no domain configured
                if not destination.startswith("tel:") and not destination.startswith("sip:"):
                     destination = f"tel:{destination}"
        elif not destination.startswith("sip:"):
             destination = f"sip:{destination}"
        
        logger.info(f"Transferring call to {destination}")
        
        participant_identity = None
        
        if self.phone_number:
            participant_identity = f"sip_{self.phone_number}"
        else:
            # Try to find a participant that is NOT the agent
            for p in self.ctx.room.remote_participants.values():
                participant_identity = p.identity
                break
        
        if not participant_identity:
            logger.error("Could not determine participant identity for transfer")
            return "Failed to transfer: could not identify the caller."

        try:
            logger.info(f"Transferring participant {participant_identity} to {destination}")
            await self.ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=self.ctx.room.name,
                    participant_identity=participant_identity,
                    transfer_to=destination,
                    play_dialtone=False
                )
            )
            return "Transfer initiated successfully."
        except Exception as e:
            logger.error(f"Transfer failed: {e}")
            return f"Error executing transfer: {e}"


class OutboundAssistant(Agent):
    """
    An AI agent tailored for outbound calls.
    Attempts to be helpful and concise.
    """
    def __init__(self, tools: list) -> None:
        super().__init__(
            instructions=config.SYSTEM_PROMPT,
            tools=tools,
        )




async def entrypoint(ctx: agents.JobContext):
    """
    Main entrypoint for the agent.
    """
    logger.info(f"Connecting to room: {ctx.room.name}")
    await ctx.connect()
    
    phone_number = None
    config_dict = {}
    
    # Check Job Metadata
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            phone_number = data.get("phone_number")
            config_dict = data
    except Exception:
        pass
        
    # Check Room Metadata
    try:
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            if data.get("phone_number"):
                phone_number = data.get("phone_number")
            config_dict.update(data) # Merge configs
    except Exception:
        logger.warning("No valid JSON metadata found in Room.")

    # Initialize function context
    fnc_ctx = TransferFunctions(ctx, phone_number)

    from persistence import generate_and_save_call_proposal

    # Initialize the Agent Session with plugins
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model=config.STT_MODEL, language=config.STT_LANGUAGE), 
        llm=_build_llm(config_dict.get("model_provider")),
        tts=_build_tts(config_dict.get("model_provider"), config_dict.get("voice_id")),
    )

    client_id = config_dict.get("client_id")
    transcript = []

    @ctx.room.on("transcription_received")
    def on_transcription(transcription: rtc.Transcription):
        for segment in transcription.segments:
            if segment.text:
                speaker = "User" if "sip_" in transcription.participant.identity else "Agent"
                transcript.append(f"{speaker}: {segment.text}")

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.Participant):
        logger.info(f"Participant {participant.identity} disconnected")
        if "sip_" in participant.identity:
            logger.info("SIP user disconnected. Shutting down agent.")
            ctx.shutdown()

    async def on_shutdown():
        logger.info("Agent shutting down. Checking for transcript to generate proposal...")
        hist_transcript = []
        try:
            if session and hasattr(session, 'chat_ctx'):
                for msg in session.chat_ctx.messages:
                    if msg.role in ['user', 'assistant'] and isinstance(msg.content, str):
                        role_str = "Agent" if msg.role == "assistant" else "User"
                        hist_transcript.append(f"{role_str}: {msg.content}")
        except Exception as e:
            logger.warning(f"Failed to fetch session history: {e}")

        final_transcript = transcript if len(transcript) > len(hist_transcript) else hist_transcript

        if client_id and final_transcript:
            full_transcript = "\n".join(final_transcript)
            logger.info(f"Triggering LLM proposal with final transcript ({len(final_transcript)} turns)...")
            await generate_and_save_call_proposal(client_id, full_transcript)
            
            # Log call_completed and proposal_generated events to tracking
            try:
                import httpx
                async with httpx.AsyncClient() as http:
                    await http.post(
                        f"http://127.0.0.1:8000/api/tracking/{client_id}",
                        json={"event": "call_completed", "note": f"Call ended with {len(final_transcript)} transcript turns."}
                    )
                    await http.post(
                        f"http://127.0.0.1:8000/api/tracking/{client_id}",
                        json={"event": "proposal_generated", "note": "Auto-generated from call transcript via MEDDPICC."}
                    )
                    logger.info(f"✅ Tracking events logged for client {client_id}")
            except Exception as track_err:
                logger.warning(f"Failed to log tracking events: {track_err}")
        else:
            logger.info("No client_id or transcript found. Skipping proposal.")

    ctx.add_shutdown_callback(on_shutdown)

    # Removed immediate session.start(ctx.room) to prevent ValueError: participant must be set.
    # We will start the session after the participant joins the room.

    # Note: VoicePipelineAgent automatically handles room input options and closing.
    # We must ensure the room_input_options were handled if needed.
    # By default, VoicePipelineAgent manages its own audio streams.

    if not phone_number and hasattr(config, 'DEFAULT_TRANSFER_NUMBER') and config.DEFAULT_TRANSFER_NUMBER:
        phone_number = config.DEFAULT_TRANSFER_NUMBER
        logger.info(f"No phone number provided in payload, defaulting to {phone_number}")

    should_dial = False
    if phone_number:
        user_already_here = False
        for p in ctx.room.remote_participants.values():
            if f"sip_{phone_number}" in p.identity or "sip_" in p.identity:
                user_already_here = True
                break
        
        if not user_already_here:
            should_dial = True
            logger.info("User not in room. Agent will initiate dial-out.")
        else:
            logger.info("User already in room (Dashboard dispatched).")

    if should_dial:
        logger.info(f"Initiating outbound SIP call to {phone_number}...")
        try:
            print(f"📠 [Agent] Dialing phone number: {phone_number} via Trunk: {config.SIP_TRUNK_ID}")
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=config.SIP_TRUNK_ID,
                    sip_call_to=phone_number,
                    participant_identity=f"sip_{phone_number}",
                    wait_until_answered=True, 
                )
            )
            print(f"📢 [Agent] Call answered by {phone_number}. Waiting for user to appear in room...")
            
            # Wait for the SIP participant to join the room metadata/tracks
            max_retries = 20
            target_p = None
            for i in range(max_retries):
                for p in ctx.room.remote_participants.values():
                    if f"sip_{phone_number}" in p.identity or "sip_" in p.identity:
                        target_p = p
                        break
                if target_p:
                    break
                await asyncio.sleep(0.5)
            
            if not target_p:
                logger.error("Timed out waiting for SIP participant to join the room.")
                ctx.shutdown()
                return

            logger.info(f"User {target_p.identity} joined. Starting voice session...")
            
            # Start the session (AgentSession)
            await session.start(
                agent=OutboundAssistant(tools=list(fnc_ctx.function_tools.values())),
                room=ctx.room,
            )
            
            # Stabilization delay
            await asyncio.sleep(1.0)
            
            # Explicitly trigger the LLM to generate the initial greeting
            logger.info(f"Triggering Agent greeting: {config.INITIAL_GREETING}")
            try:
                session.say(config.INITIAL_GREETING, allow_interruptions=True)
            except Exception as e:
                logger.error(f"Error speaking initial greeting: {e}")
            
        except Exception as e:
            logger.error(f"Failed to place outbound call: {e}")
            ctx.shutdown()
    else:
        logger.info("Detecting existing participant for greeting...")
        target_p = None
        if ctx.room.remote_participants:
            target_p = list(ctx.room.remote_participants.values())[0]
        
        if target_p:
            await session.start(
                agent=OutboundAssistant(tools=list(fnc_ctx.function_tools.values())),
                room=ctx.room,
            )
            logger.info(f"Agent fallback greeting attempt.")
            try:
                session.say(config.INITIAL_GREETING, allow_interruptions=True)
            except Exception as e:
                logger.error(f"Error speaking fallback greeting: {e}")
        else:
            logger.warning("No participant found to greet. Shutting down.")
            ctx.shutdown()


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="outbound-caller", 
        )
    )
