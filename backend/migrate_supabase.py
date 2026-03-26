import json
import os
from pathlib import Path
from datetime import datetime
from utils.supabase_client import supabase

DATA_DIR = Path(__file__).parent / "data"

def migrate_agents():
    print("Migrating agents...")
    agents_path = DATA_DIR / "agents.json"
    if not agents_path.exists():
        print("No agents.json found.")
        return
        
    with open(agents_path, "r", encoding="utf-8") as f:
        agents = json.load(f)
        
    for email, data in agents.items():
        record = {
            "email": email,
            "password": data.get("password"),
            "name": data.get("name"),
            "updated_at": data.get("updatedAt", datetime.now().isoformat())
        }
        supabase.table("agents").upsert(record).execute()
    print("Agents migrated.")

def migrate_clients():
    print("Migrating clients...")
    clients_path = DATA_DIR / "clients.json"
    if not clients_path.exists():
        print("No clients.json found.")
        return
        
    with open(clients_path, "r", encoding="utf-8") as f:
        clients = json.load(f)
        
    for c in clients:
        record = {
            "client_id": c.get("client_id"),
            "company": c.get("company"),
            "industry": c.get("industry"),
            "email": c.get("email"),
            "notes": c.get("notes"),
            "size": c.get("size"),
            "created_at": c.get("createdAt", datetime.now().isoformat())
        }
        supabase.table("clients").upsert(record).execute()
    print("Clients migrated.")

def migrate_tracking():
    print("Migrating tracking...")
    events_path = DATA_DIR / "events.json"
    if not events_path.exists():
        print("No events.json found.")
        return
        
    with open(events_path, "r", encoding="utf-8") as f:
        events = json.load(f)
        
    for client_id, client_events in events.items():
        for e in client_events:
            record = {
                "client_id": client_id,
                "event": e.get("event"),
                "metadata": {"note": e.get("note")} if e.get("note") else {},
                "timestamp": e.get("timestamp", datetime.now().isoformat())
            }
            supabase.table("tracking").insert(record).execute()
    print("Tracking migrated.")

def migrate_proposals():
    print("Migrating proposals...")
    proposals_path = DATA_DIR / "proposals.json"
    if not proposals_path.exists():
        print("No proposals.json found.")
        return
        
    with open(proposals_path, "r", encoding="utf-8") as f:
        proposals = json.load(f)
        
    for client_id, data in proposals.items():
        versions = data.get("versions", [])
        if not versions and "proposal_html" in data:
            # Handle old single-version format
            versions = [{
                "version": 1,
                "proposal_html": data.get("proposal_html"),
                "title": data.get("title"),
                "savedAt": data.get("savedAt")
            }]
            
        for v in versions:
            record = {
                "client_id": client_id,
                "version": v.get("version", 1),
                "title": v.get("title"),
                "proposal_html": v.get("proposal_html"),
                "created_at": v.get("savedAt", datetime.now().isoformat())
            }
            try:
                supabase.table("proposals").upsert(record).execute()
            except Exception as e:
                print(f"Error migrating proposal v{v.get('version')} for {client_id}: {e}")
    print("Proposals migrated.")

if __name__ == "__main__":
    migrate_agents()
    migrate_clients()
    migrate_tracking()
    migrate_proposals()
    print("Full migration complete!")
