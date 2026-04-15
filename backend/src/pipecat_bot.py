import os
import sys
import json
from typing import Any, Dict
from loguru import logger
from dotenv import load_dotenv

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.deepgram.tts import DeepgramTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from utils.supabase_client import supabase

load_dotenv(override=True)

async def run_bot(transport: BaseTransport, handle_sigint: bool, client_data: Dict[str, Any] = None):
    # Context setup
    name = client_data.get("name") if client_data else "there"
    company = client_data.get("company") if client_data else "your company"
    client_id = client_data.get("client_id") if client_data else None
    industry = client_data.get("industry") if client_data else "your sector"

    # Personalized System Instruction (Presales Consultant)
    sys_instr = f"""You are an expert presales consultant from Fristine Infotech, a Zoho Premium Partner.
You are on a call with {name} from {company} (Industry: {industry}).

YOUR APPROACH:
1. Greet warmly and ask what they need.
2. Listen to their problem. If unclear, ask 1-2 specific questions.
3. Focus on their current situation, pain points, and systems they use.
4. Recommend a specific solution that matches their need.
5. Explain how it solves their problem and mention key benefits.

RESPONSE STYLE:
- Keep responses short and conversational for voice. No special characters or markdown.
- Ask maximum 2 questions at a time.
- Give specific recommendations, not generic product lists.
- Be helpful, not salesy. Focus on solving their problem.
- Do not discuss pricing or costs. If asked, say you will connect them with the sales team.

WHEN YOU HAVE ENOUGH INFO:
Recommend a specific solution, explain how it addresses their pain points in 3-4 points, mention typical implementation timeline, and ask if they would like to see a demo.

FINALIZATION:
Once you have captured the core requirements, call the 'submit_discovery_results' tool to persist the results. After success, wrap up the call professionally.
"""

    # LLM Service (Gemini)
    llm = GoogleLLMService(
        model="gemini-2.0-flash",
        api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        settings=GoogleLLMService.Settings(
            system_instruction=sys_instr,
        ),
    )

    # Tool for requirement submission
    async def submit_discovery_results(summary: str, requirements: str):
        logger.info(f"[Bot] Discovery Complete for {client_id}. Submitting results...")
        if not client_id:
            return "Error: No client ID associated with this call."
        
        try:
            # Update Supabase
            supabase.table("clients").update({
                "summary": summary,
                "requirements": requirements,
                "status": "Submitted"
            }).eq("client_id", client_id).execute()
            
            # Log event
            supabase.table("tracking").insert({
                "client_id": client_id,
                "event": "discovery_call_completed",
                "note": f"Outbound call completed. AI gathered: {summary[:100]}..."
            }).execute()
            
            logger.success(f"[Bot] Database updated for {client_id}")
            return "Requirements submitted successfully. You can now wrap up the call."
        except Exception as e:
            logger.error(f"[Bot] Failed to update DB: {e}")
            return f"Error updating database: {str(e)}"

    llm.register_function("submit_discovery_results", submit_discovery_results)

    # STT Service (Deepgram)
    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    # TTS Service (Cartesia with Deepgram fallback)
    cartesia_key = os.getenv("CARTESIA_API_KEY")
    if cartesia_key:
        tts = CartesiaTTSService(
            api_key=cartesia_key,
            settings=CartesiaTTSService.Settings(
                voice="71a7ad14-091c-4e8e-a314-022ece01c121",  # British Reading Lady
            ),
        )
    else:
        tts = DeepgramTTSService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    # Pre-load context with a user message that will trigger the LLM to greet
    context = LLMContext()
    context.set_messages([
        {
            "role": "system",
            "content": sys_instr
        },
        {
            "role": "user",
            "content": f"[SYSTEM: The call has just connected to {name} from {company}. Greet them warmly and ask how you can help them today. Keep it to 2 sentences max.]"
        }
    ])
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),  # Websocket input from client
            stt,  # Speech-To-Text
            user_aggregator,
            llm,  # LLM
            tts,  # Text-To-Speech
            transport.output(),  # Websocket output to client
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    runner = PipelineRunner(handle_sigint=handle_sigint)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.success(f"[Bot] Twilio client connected for {company}. Sending greeting...")
        import asyncio
        await asyncio.sleep(0.3)
        # Inject the pre-loaded context into the LLM to trigger the greeting
        from pipecat.frames.frames import LLMMessagesFrame
        await task.queue_frames([LLMMessagesFrame(context.messages)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.warning(f"[Bot] Twilio client disconnected for {company}")
        await task.cancel()

    try:
        logger.info("[Bot] Starting Pipecat pipeline runner...")
        await runner.run(task)
    except Exception as e:
        logger.error(f"[Bot] Pipeline runner crashed: {e}")


async def start_frc_bot(websocket: Any, stream_id: str, call_id: str, client_id: str = None):
    """Entry point for initiating the Fristine AI bot on a Twilio WebSocket."""
    logger.info(f"Initiating Fristine AI Bot for Call: {call_id} (Client: {client_id})")
    
    client_data = {}
    if client_id and supabase:
        try:
            resp = supabase.table("clients").select("*").eq("client_id", client_id).execute()
            if resp.data:
                client_data = resp.data[0]
                logger.info(f"[Bot] Fetched client data for: {client_data.get('company')}")
        except Exception as e:
            logger.error(f"[Bot] Failed to fetch client context: {e}")

    serializer = TwilioFrameSerializer(
        stream_sid=stream_id,
        call_sid=call_id,
        account_sid=os.getenv("TWILIO_ACCOUNT_SID", ""),
        auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
    )

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    await run_bot(transport, handle_sigint=False, client_data=client_data)
