from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import os, json

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# ── Supabase (optional) ──────────────────────────────────────────────────────
try:
    from utils.supabase_client import supabase
except Exception:
    supabase = None

# ── Local agents.json fallback ───────────────────────────────────────────────
AGENTS_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "misc", "agents.json"))

def _read_agents():
    try:
        with open(AGENTS_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def _write_agents(data):
    with open(AGENTS_PATH, "w") as f:
        json.dump(data, f, indent=2)

def _get_agent(email: str):
    """Return agent dict from Supabase if available, else from agents.json."""
    if supabase:
        try:
            res = supabase.table("agents").select("*").eq("email", email).execute()
            return res.data[0] if res.data else None
        except Exception:
            pass
    return _read_agents().get(email)

def _upsert_agent(email: str, password: str):
    """Upsert agent to Supabase if available, else to agents.json."""
    if supabase:
        try:
            supabase.table("agents").upsert({
                "email": email,
                "password": password,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).execute()
            return
        except Exception:
            pass
    agents = _read_agents()
    agents[email] = {"email": email, "password": password, "updatedAt": datetime.now(timezone.utc).isoformat()}
    _write_agents(agents)

# ── Models ───────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class PassRequest(BaseModel):
    email: str
    password: str

# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/check")
async def check_auth(email: str):
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    email_lower = email.lower()
    if not email_lower.endswith("@fristinetech.com"):
        raise HTTPException(status_code=403, detail="Access restricted to @fristinetech.com accounts")
    agent = _get_agent(email_lower)
    has_password = bool(agent.get("password")) if agent else False
    return {"hasPassword": has_password, "email": email_lower}

@router.post("/login/")
async def login(req: LoginRequest):
    email_lower = req.email.lower()
    if not email_lower.endswith("@fristinetech.com"):
        raise HTTPException(status_code=403, detail="Access restricted to @fristinetech.com accounts")
    agent = _get_agent(email_lower)
    if not agent or not agent.get("password"):
        raise HTTPException(status_code=401, detail={"error": "NO_PASSWORD", "message": "No password set for this account — please set one."})
    if agent.get("password") != req.password:
        raise HTTPException(status_code=401, detail={"error": "WRONG_PASSWORD", "message": "Incorrect password."})
    return {"success": True, "email": email_lower, "name": agent.get("name") or email_lower.split("@")[0]}

@router.post("/set-password/")
async def set_password(req: PassRequest):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email_lower = req.email.lower()
    if not email_lower.endswith("@fristinetech.com"):
        raise HTTPException(status_code=403, detail="Access restricted to @fristinetech.com accounts")
    _upsert_agent(email_lower, req.password)
    return {"success": True}
