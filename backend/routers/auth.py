from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from utils.supabase_client import supabase

router = APIRouter(prefix="/api/users", tags=["Auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

class PassRequest(BaseModel):
    email: str
    password: str

@router.get("/check")
async def check_auth(email: str):
    if not email:
        raise HTTPException(status_code=400, detail="email required")
    email_lower = email.lower()
    if not email_lower.endswith("@fristinetech.com"):
        raise HTTPException(status_code=403, detail="Access restricted to @fristinetech.com accounts")
        
    res = supabase.table("agents").select("password").eq("email", email_lower).execute()
    agent = res.data[0] if res.data else None
    has_password = bool(agent.get("password")) if agent else False
    
    return {"hasPassword": has_password, "email": email_lower}

@router.post("/login/")
async def login(req: LoginRequest):
    email_lower = req.email.lower()
    if not email_lower.endswith("@fristinetech.com"):
        raise HTTPException(status_code=403, detail="Access restricted to @fristinetech.com accounts")
        
    res = supabase.table("agents").select("*").eq("email", email_lower).execute()
    agent = res.data[0] if res.data else None
    
    if not agent or not agent.get("password"):
        raise HTTPException(status_code=401, detail={"error": "NO_PASSWORD", "message": "No password set for this account — please set one."})
        
    if agent.get("password") != req.password:
        raise HTTPException(status_code=401, detail={"error": "WRONG_PASSWORD", "message": "Incorrect password."})
        
    return {
        "success": True, 
        "email": email_lower, 
        "name": (agent.get("name") if agent else None) or email_lower.split("@")[0]
    }

@router.post("/set-password/")
async def set_password(req: PassRequest):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email_lower = req.email.lower()
    if not email_lower.endswith("@fristinetech.com"):
        raise HTTPException(status_code=403, detail="Access restricted to @fristinetech.com accounts")
        
    # Upsert logic
    data = {
        "email": email_lower,
        "password": req.password,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    res = supabase.table("agents").upsert(data).execute()
    
    return {"success": True}
