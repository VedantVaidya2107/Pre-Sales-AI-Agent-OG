import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import asyncio

from routers import auth, clients, tracking, proposals, email, gemini, documents, voice

load_dotenv(override=False)

# ── Keep-alive self-ping (prevents Render free tier from sleeping) ────────
RENDER_URL = os.environ.get("RENDER_EXTERNAL_URL")  # Auto-set by Render

async def keep_alive():
    """Ping our own /health endpoint every 10 minutes to prevent Render sleep."""
    if not RENDER_URL:
        return  # Only run on Render, not locally
    import httpx
    url = f"{RENDER_URL}/health"
    print(f"[Keep-Alive] Starting self-ping → {url}")
    while True:
        await asyncio.sleep(600)  # 10 minutes
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(url, timeout=10)
                print(f"[Keep-Alive] Pinged {url} → {r.status_code}")
        except Exception as e:
            print(f"[Keep-Alive] Ping failed: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Startup] App is starting up...")
    task = asyncio.create_task(keep_alive())
    yield
    print("[Shutdown] App is shutting down...")
    task.cancel()

app = FastAPI(title="Fristine Presales Backend", redirect_slashes=True, lifespan=lifespan)


# CORS Middleware
# We MUST use explicit origins (not "*") when allow_credentials is True
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://vedantvaidya2107.github.io",
    "https://vedantvaidya2107.github.io/",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    from datetime import datetime, timezone
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}

app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(tracking.router)
app.include_router(proposals.router)
app.include_router(email.router)
app.include_router(gemini.router)
app.include_router(documents.router)
app.include_router(voice.router)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

