"""Supabase Client & Synchronization Engine for Edutainal Learning Evidence Portal.

Enables seamless dual-mode database operation:
- Local SQLite (default for development/offline tests)
- Supabase Cloud PostgreSQL (production, persistent cloud sync, realtime events)
"""
import os
import json
import sqlite3
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Optional, Dict, Any, List

ROOT = Path(__file__).resolve().parent.parent

def _load_env():
    env_file = ROOT / '.env'
    if not env_file.exists():
        return
    try:
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k not in os.environ:
                        os.environ[k] = v
    except Exception:
        pass

_load_env()

SQLITE_DB = ROOT / 'backend' / 'portal-secure.sqlite3'

# Environment variables
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip()
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY', '').strip()
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '').strip()

_client: Any = None


def is_configured() -> bool:
    """Check if Supabase credentials are present."""
    return bool(SUPABASE_URL and (SUPABASE_KEY or SUPABASE_ANON_KEY))


def get_client() -> Any:
    """Get or create singleton Supabase client using dynamic import."""
    global _client
    if _client is not None:
        return _client
    
    if not is_configured():
        return None

    try:
        import supabase  # type: ignore
        key = SUPABASE_KEY or SUPABASE_ANON_KEY
        create_fn = getattr(supabase, 'create_client', None)
        if callable(create_fn):
            _client = create_fn(SUPABASE_URL, key)
            return _client
    except Exception as e:
        print(f"[Supabase] SDK initialization notice: {e}")
    return None


def _rest_request(endpoint: str, method: str = 'GET', data: Optional[Any] = None, params: Optional[Dict[str, str]] = None) -> Any:
    """Zero-dependency HTTP fallback using standard urllib for robust REST operations."""
    key = SUPABASE_KEY or SUPABASE_ANON_KEY
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
    }
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{endpoint}"
    if params:
        query_string = urllib.parse.urlencode(params)
        url = f"{url}&{query_string}" if '?' in url else f"{url}?{query_string}"

    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            content = resp.read().decode('utf-8')
            return json.loads(content) if content else None
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='replace')
        print(f"[Supabase REST] Error {e.code}: {err_msg}")
        raise


def test_connection() -> Dict[str, Any]:
    """Test connection to Supabase instance."""
    if not is_configured():
        return {
            "status": "unconfigured",
            "message": "SUPABASE_URL and SUPABASE_KEY are not set in environment or .env"
        }
    
    # Try SDK first
    client = get_client()
    if client:
        try:
            res = client.table("students").select("id").limit(1).execute()
            return {
                "status": "connected",
                "driver": "supabase-py",
                "url": SUPABASE_URL,
                "data": res.data
            }
        except Exception as e:
            pass
            
    # Try direct HTTP REST fallback
    try:
        data = _rest_request("students?select=id&limit=1")
        return {
            "status": "connected",
            "driver": "rest-api",
            "url": SUPABASE_URL,
            "data": data
        }
    except Exception as e:
        return {
            "status": "error",
            "url": SUPABASE_URL,
            "error": str(e)
        }


def push_sqlite_to_supabase(sqlite_path: Optional[str] = None) -> Dict[str, Any]:
    """Migrate and sync all SQLite records directly into Supabase tables."""
    if not is_configured():
        raise RuntimeError("Supabase client is not configured")

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
        sync_student(sid, data)
        stats["students"] += 1

    # 2. Sync Observations
    obs_rows = cur.execute("SELECT id, student_id, observed_on, created_at, data FROM observations").fetchall()
    for oid, sid, observed_on, created_at, data_str in obs_rows:
        data = json.loads(data_str) if isinstance(data_str, str) else data_str
        sync_observation(oid, sid, observed_on, created_at, data)
        stats["observations"] += 1

    # 3. Sync Users
    user_rows = cur.execute("SELECT id, username, name, password_hash, role, active FROM users").fetchall()
    for uid, username, name, pwhash, role, active in user_rows:
        sync_user(uid, username, name, pwhash, role, bool(active))
        stats["users"] += 1

    # 4. Sync Parent-Children
    pc_rows = cur.execute("SELECT user_id, student_id FROM parent_children").fetchall()
    grouped: Dict[str, List[str]] = {}
    for uid, sid in pc_rows:
        grouped.setdefault(uid, []).append(sid)
    for uid, sids in grouped.items():
        sync_parent_children(uid, sids)
        stats["parent_children"] += len(sids)

    con.close()
    return stats


def sync_observation(obs_id: str, student_id: str, observed_on: str, created_at: str, data: dict):
    """Sync an individual observation to Supabase synchronously."""
    if not is_configured():
        return
    payload = {
        "id": obs_id,
        "student_id": student_id,
        "observed_on": observed_on,
        "created_at": created_at,
        "data": data
    }
    client = get_client()
    if client:
        try:
            client.table("observations").upsert(payload).execute()
            return
        except Exception as e:
            print(f"[Supabase Sync] SDK notice: {e}")
    try:
        _rest_request("observations", method='POST', data=payload)
    except Exception as e:
        print(f"[Supabase Sync] Warning: Failed to sync observation {obs_id}: {e}")


def sync_student(student_id: str, data: dict):
    """Sync an individual student to Supabase synchronously."""
    if not is_configured():
        return
    payload = {"id": student_id, "data": data}
    client = get_client()
    if client:
        try:
            client.table("students").upsert(payload).execute()
            return
        except Exception as e:
            print(f"[Supabase Sync] SDK notice: {e}")
    try:
        _rest_request("students", method='POST', data=payload)
    except Exception as e:
        print(f"[Supabase Sync] Warning: Failed to sync student {student_id}: {e}")


def sync_user(user_id: str, username: str, name: str, password_hash: str, role: str, active: bool = True):
    """Sync an individual user account to Supabase synchronously."""
    if not is_configured():
        return
    payload = {
        "id": user_id,
        "username": username,
        "name": name,
        "password_hash": password_hash,
        "role": role,
        "active": active
    }
    client = get_client()
    if client:
        try:
            client.table("users").upsert(payload).execute()
            return
        except Exception as e:
            print(f"[Supabase Sync] SDK notice: {e}")
    try:
        _rest_request("users", method='POST', data=payload)
    except Exception as e:
        print(f"[Supabase Sync] Warning: Failed to sync user {username}: {e}")


def sync_parent_children(user_id: str, student_ids: List[str]):
    """Sync parent-child relationships to Supabase synchronously."""
    if not is_configured():
        return
    client = get_client()
    if client:
        try:
            client.table("parent_children").delete().eq("user_id", user_id).execute()
            for sid in student_ids:
                client.table("parent_children").upsert({"user_id": user_id, "student_id": sid}).execute()
            return
        except Exception as e:
            print(f"[Supabase Sync] SDK notice: {e}")
    try:
        _rest_request(f"parent_children?user_id=eq.{user_id}", method='DELETE')
        for sid in student_ids:
            _rest_request("parent_children", method='POST', data={"user_id": user_id, "student_id": sid})
    except Exception as e:
        print(f"[Supabase Sync] Warning: Failed to sync parent_children for {user_id}: {e}")


def sync_password(user_id: str, password_hash: str):
    """Update user password in Supabase synchronously."""
    if not is_configured():
        return
    client = get_client()
    if client:
        try:
            client.table("users").update({"password_hash": password_hash}).eq("id", user_id).execute()
            return
        except Exception as e:
            print(f"[Supabase Sync] SDK notice: {e}")
    try:
        _rest_request(f"users?id=eq.{user_id}", method='PATCH', data={"password_hash": password_hash})
    except Exception as e:
        print(f"[Supabase Sync] Warning: Failed to update password for {user_id}: {e}")
