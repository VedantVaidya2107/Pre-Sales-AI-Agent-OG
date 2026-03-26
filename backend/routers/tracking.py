from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from utils.supabase_client import supabase

router = APIRouter(prefix="/api/tracking", tags=["Tracking"])

class TrackingEvent(BaseModel):
    event: str
    note: Optional[str] = None

@router.get("/{client_id}/")
async def get_events(client_id: str):
    res = supabase.table("tracking").select("*").eq("client_id", client_id).order("timestamp", desc=True).execute()
    return res.data or []

@router.post("/{client_id}/")
async def create_event(client_id: str, req: TrackingEvent):
    # Check if event already exists for this client (deduplication as per old logic)
    res_check = supabase.table("tracking").select("id").eq("client_id", client_id).eq("event", req.event).execute()
    
    if not res_check.data:
        data = {
            "client_id": client_id,
            "event": req.event,
            "metadata": {"note": req.note} if req.note else {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        supabase.table("tracking").insert(data).execute()
        
    res_all = supabase.table("tracking").select("*").eq("client_id", client_id).order("timestamp", desc=True).execute()
    return {"success": True, "events": res_all.data or []}

@router.delete("/{client_id}/")
async def delete_events(client_id: str):
    supabase.table("tracking").delete().eq("client_id", client_id).execute()
    return {"success": True}
