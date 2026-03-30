from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from utils.supabase_client import supabase

router = APIRouter(prefix="/api/clients", tags=["Clients"])

class ClientCreate(BaseModel):
    company: str
    email: str
    industry: Optional[str] = ""
    notes: Optional[str] = ""
    size: Optional[str] = ""
    phone: Optional[str] = ""

async def generate_client_id():
    # Use RPC or just select all and find max for now to keep it simple
    res = supabase.table("clients").select("client_id").execute()
    clients_list = res.data or []
    comps = [c.get("client_id", "") for c in clients_list if isinstance(c.get("client_id"), str)]
    valid_ids = [int(i.replace("FRIST", "")) for i in comps if i.startswith("FRIST") and i.replace("FRIST", "").isdigit()]
    next_id = max(valid_ids) + 1 if valid_ids else 1
    return f"FRIST{next_id:03d}"

@router.get("/")
async def get_clients():
    try:
        res = supabase.table("clients").select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print(f"[Backend Error] Clients GET failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/next-id")
async def get_next_id():
    nid = await generate_client_id()
    return {"next_id": nid}

@router.get("/{client_id}")
async def get_client(client_id: str):
    res = supabase.table("clients").select("*").eq("client_id", client_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Client not found")
    return res.data[0]

@router.post("/", status_code=201)
async def create_client(req: ClientCreate):
    client_id = await generate_client_id()
    new_client = {
        "client_id": client_id,
        "company": (req.company or "").strip(),
        "industry": (req.industry or "").strip(),
        "email": (req.email or "").strip(),
        "phone": (req.phone or "").strip(),
        "notes": (req.notes or "").strip(),
        "size": (req.size or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    try:
        res = supabase.table("clients").insert(new_client).execute()
        if not res.data:
             raise Exception("Supabase insert returned no data (check RLS or Column names)")
        return res.data[0]
    except Exception as e:
        print(f"[Supabase Error] create_client failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

@router.put("/{client_id}")
async def update_client(client_id: str, updates: dict):
    # Ensure client_id is not in updates or matches
    updates.pop("client_id", None)
    res = supabase.table("clients").update(updates).eq("client_id", client_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Client not found")
    return res.data[0]

@router.delete("/{client_id}")
async def delete_client(client_id: str):
    res = supabase.table("clients").delete().eq("client_id", client_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Client not found or deletion failed")
    return {"success": True}
