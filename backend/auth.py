"""Password hashing and expiring, server-side browser sessions."""
import hashlib
import hmac
import secrets
import time

SESSION_COOKIE = 'edutainal_session'
SESSION_SECONDS = 8 * 60 * 60


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64*1024*1024)
    return f'scrypt${salt}${digest.hex()}'


def verify_password(password, encoded):
    try:
        scheme, salt, expected = encoded.split('$')
        if scheme != 'scrypt':
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64*1024*1024)
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


DUMMY_PASSWORD = hash_password(secrets.token_urlsafe(32))


def init_tables(db):
    db.execute('''CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('parent','observer')),
        active INTEGER NOT NULL DEFAULT 1)''')
    db.execute('''CREATE TABLE IF NOT EXISTS parent_children (
        user_id TEXT NOT NULL REFERENCES users(id), student_id TEXT NOT NULL REFERENCES students(id),
        PRIMARY KEY(user_id, student_id))''')
    db.execute('''CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        csrf_token TEXT NOT NULL, expires_at REAL NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS login_attempts (
        username TEXT NOT NULL, address TEXT NOT NULL, attempted_at REAL NOT NULL)''')
    db.execute('CREATE INDEX IF NOT EXISTS login_attempt_time ON login_attempts(attempted_at)')


def actor_for_token(db, token):
    if not token:
        return None
    row = db.execute('''SELECT u.id,u.username,u.name,u.role,s.csrf_token FROM auth_sessions s
        JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1''',
        (token_hash(token), time.time())).fetchone()
    if not row:
        return None
    actor = dict(row)
    actor['students'] = [r['student_id'] for r in db.execute('SELECT student_id FROM parent_children WHERE user_id=?', (actor['id'],))]
    return actor


def create_session(db, user_id):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.execute('DELETE FROM auth_sessions WHERE expires_at<=?', (time.time(),))
    db.execute('INSERT INTO auth_sessions VALUES (?,?,?,?)',
               (token_hash(token), user_id, csrf, time.time()+SESSION_SECONDS))
    return token
