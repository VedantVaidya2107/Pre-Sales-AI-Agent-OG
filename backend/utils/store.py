import os
import json
from pathlib import Path

# Base directory for the data store (backend/data)
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"

# Ensure the data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

def read(filename: str, default_value=None):
    """Read a JSON data file. Returns default_value if missing or corrupt."""
    if default_value is None:
        default_value = []
        
    fp = DATA_DIR / filename
    if not fp.exists():
        return default_value
        
    try:
        with open(fp, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_value

def write(filename: str, data):
    """Write data to a JSON file."""
    fp = DATA_DIR / filename
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
