"""Supabase Client & Synchronization Engine for Edutainal Learning Evidence Portal.

Enables seamless dual-mode database operation:
- Local SQLite (default for development/offline tests)
- Supabase Cloud PostgreSQL (production, persistent cloud sync, realtime events)
"""
import os
import json
import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')

SQLITE_DB = ROOT / 'backend' / 'portal-secure.sqlite3'

# Environment variables
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY', '').strip()
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '').strip()

_client = None


def is_configured() -> bool:
    """Check if Supabase credentials are present."""
    return bool(SUPABASE_URL and (SUPABASE_KEY or SUPABASE_ANON_KEY))


def get_client():
    """Get or create singleton Supabase client."""
    global _client
    if _client is not None:
        return _client
    
    if not is_configured():
        return None

    try:
        from supabase import create_client, ClientOptions
        key = SUPABASE_KEY or SUPABASE_ANON_KEY
        _client = create_client(SUPABASE_URL, key)
        return _client
    except Exception as e:
        print(f"[Supabase] Initialization warning: {e}")
        return None


def test_connection() -> Dict[str, Any]:
    """Test connection to Supabase instance."""
    if not is_configured():
        return {
            "status": "unconfigured",
            "message": "SUPABASE_URL and SUPABASE_KEY are not set in environment or .env"
        }
    client = get_client()
    if not client:
        return {
            "status": "error",
            "message": "Failed to create Supabase client instance"
        }
    try:
        res = client.table("students").select("id").limit(1).execute()
        return {
            "status": "connected",
            "url": SUPABASE_URL,
            "data": res.data
        }
    except Exception as e:
        return {
            "status": "error",
            "url": SUPABASE_URL,
            "error": str(e)
        }


def push_sqlite_to_supabase(sqlite_path: Optional[str] = None) -> Dict[str, Any]:
    """Migrate and sync all SQLite records directly into Supabase tables."""
    client = get_client()
    if not client:
        raise RuntimeError("Supabase client is not configured or reachable")

    db_file = sqlite_path or str(SQLITE_DB)
    con = sqlite3.connect(db_file)
    cur = con.cursor()

    stats = {
        "students": 0,
        "observations": 0,
        "users": 0,
        "parent_children": 0
    }

    # 1. Sync Students
    students_rows = cur.execute("SELECT id, data FROM students").fetchall()
    for sid, data_str in students_rows:
        data = json.loads(data_str) if isinstance(data_str, str) else data_str
        client.table("students").upsert({"id": sid, "data": data}).execute()
        stats["students"] += 1

    # 2. Sync Observations
    obs_rows = cur.execute("SELECT id, student_id, observed_on, created_at, data FROM observations").fetchall()
    for oid, sid, observed_on, created_at, data_str in obs_rows:
        data = json.loads(data_str) if isinstance(data_str, str) else data_str
        client.table("observations").upsert({
            "id": oid,
            "student_id": sid,
            "observed_on": observed_on,
            "created_at": created_at,
            "data": data
        }).execute()
        stats["observations"] += 1

    # 3. Sync Users
    user_rows = cur.execute("SELECT id, username, name, password_hash, role, active FROM users").fetchall()
    for uid, username, name, pwhash, role, active in user_rows:
        client.table("users").upsert({
            "id": uid,
            "username": username,
            "name": name,
            "password_hash": pwhash,
            "role": role,
            "active": bool(active)
        }).execute()
        stats["users"] += 1

    # 4. Sync Parent-Children
    pc_rows = cur.execute("SELECT user_id, student_id FROM parent_children").fetchall()
    for uid, sid in pc_rows:
        client.table("parent_children").upsert({
            "user_id": uid,
            "student_id": sid
        }).execute()
        stats["parent_children"] += 1

    con.close()
    return stats
