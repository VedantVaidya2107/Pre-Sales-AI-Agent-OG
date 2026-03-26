from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from utils.supabase_client import supabase

router = APIRouter(prefix="/api/proposals", tags=["Proposals"])

class ProposalData(BaseModel):
    proposal_html: str
    title: Optional[str] = None
    version: Optional[int] = None

@router.get("/{client_id}")
async def get_proposal_history(client_id: str):
    res = supabase.table("proposals").select("*").eq("client_id", client_id).order("version", desc=True).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Proposal not found")
        
    return {
        "client_id": client_id,
        "versions": res.data
    }

@router.post("/{client_id}")
async def create_proposal(client_id: str, req: ProposalData):
    # Find latest version
    res_last = supabase.table("proposals").select("version").eq("client_id", client_id).order("version", desc=True).limit(1).execute()
    last_v = res_last.data[0]["version"] if res_last.data else 0
    new_v = last_v + 1
    
    data = {
        "client_id": client_id,
        "version": new_v,
        "proposal_html": req.proposal_html,
        "title": req.title or f"Zoho Proposal — {client_id} (v{new_v})",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    res = supabase.table("proposals").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save proposal")
        
    return {"success": True, "version": new_v}

@router.put("/{client_id}")
async def update_proposal(client_id: str, req: ProposalData):
    # Update a specific version or the latest
    query = supabase.table("proposals").update({"proposal_html": req.proposal_html}).eq("client_id", client_id)
    
    if req.version is not None:
        query = query.eq("version", req.version)
    else:
        # Get latest version first
        res_last = supabase.table("proposals").select("version").eq("client_id", client_id).order("version", desc=True).limit(1).execute()
        if not res_last.data:
             raise HTTPException(status_code=404, detail="Proposal version not found")
        query = query.eq("version", res_last.data[0]["version"])
        
    res = query.execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Proposal version not found")
    return {"success": True}
