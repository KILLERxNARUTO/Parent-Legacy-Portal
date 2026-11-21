"""Evidence-based learning portal. Run with python -m uvicorn backend.main:app."""
import asyncio
import json
import os
import secrets
import sqlite3
import uuid
import hmac
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone, timedelta
import sys
from pathlib import Path
from typing import Annotated, Literal

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / 'backend') not in sys.path:
    sys.path.insert(0, str(ROOT / 'backend'))

# Load .env file if present (python-dotenv is optional; fall back gracefully)
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
except ImportError:
    pass

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend import auth, supabase_client

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get('PORTAL_DB', str(ROOT / 'backend' / 'portal-secure.sqlite3'))
SECURE_COOKIES = os.environ.get('PORTAL_MODE') == 'production' or os.environ.get('PORTAL_SECURE_COOKIES') == '1'
PARENT_SESSION_COOKIE = 'edutainal_parent_session'
COMPANY_SESSION_COOKIE = 'edutainal_company_session'
PILLARS = ['Science', 'Technology', 'Research', 'Engineering', 'Arts', 'Mathematics', 'Energy', 'Resilience']
ZONES = ['Space Science', 'Rocketry', 'Robotics', 'Code Craft', 'BioTech', 'Moto Morphosis', 'Cosmic Living', 'Leadership', 'Cinematic Studio', 'Mind-Body']
PATHWAYS = [
    ('Robotics and engineering', [1, 3, 5], 'Build and test a moving prototype'),
    ('Scientific investigation', [0, 2, 5], 'Design an experiment and explain the results'),
    ('Creative technology', [1, 4, 3], 'Create an interactive story or game'),
    ('Sustainable design', [0, 3, 6], 'Compare two renewable energy designs'),
    ('Communication and leadership', [4, 2, 7], 'Present a team project and reflect on feedback'),
]


class RealtimeBroadcaster:
    """Manages real-time Server-Sent Events subscribers and synchronous queue dispatch."""
    def __init__(self):
        self._subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self._subscribers.discard(q)

    def broadcast(self, event_type: str, data: dict):
        payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        for q in list(self._subscribers):
            try:
                q.put_nowait(payload)
            except Exception:
                self._subscribers.discard(q)


broadcaster = RealtimeBroadcaster()


@contextmanager
def database():
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()


def init_db():
    with database() as db:
        db.execute('CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
        db.execute('''CREATE TABLE IF NOT EXISTS observations (
            id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id),
            observed_on TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL)''')
        db.execute('CREATE INDEX IF NOT EXISTS observation_student ON observations(student_id, observed_on)')
        auth.init_tables(db)


@asynccontextmanager
async def lifespan(app):
    init_db()
    # In dev mode, seed sample accounts so the portal is immediately usable
    if os.environ.get('PORTAL_MODE') != 'production':
        with database() as db:
            ensure_demo_accounts(db)
    yield


app = FastAPI(title='Edutainal Learning Evidence API', version='3.0.0', lifespan=lifespan)
app.mount('/static', StaticFiles(directory=ROOT / 'frontend'), name='static')
app.mount('/assets', StaticFiles(directory=ROOT / 'assets'), name='assets')


@app.middleware('http')
async def protect_browser_requests(request: Request, call_next):
    if request.url.path.startswith('/static/') and request.url.path.endswith('.html'):
        return Response(status_code=404)
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.url.path.startswith('/api/'):
        origin = request.headers.get('Origin')
        if origin and origin != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail': 'Cross-origin requests are not allowed'}, status_code=403)
        if request.headers.get('content-type', '').split(';')[0] != 'application/json':
            return JSONResponse({'detail': 'Use application/json'}, status_code=415)
    response = await call_next(request)
    if not request.url.path.startswith(('/static/', '/assets/')):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; "
        "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data: *; "
        "img-src 'self' data: https://lh3.googleusercontent.com *; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return response


def identity(request: Request):
    portal_hint = request.headers.get('X-Portal')
    with database() as db:
        token = None
        if portal_hint == 'company':
            token = request.cookies.get(COMPANY_SESSION_COOKIE)
        elif portal_hint == 'parent':
            token = request.cookies.get(PARENT_SESSION_COOKIE)
        if not token:
            token = request.cookies.get(auth.SESSION_COOKIE)
        if not token:
            token = request.cookies.get(COMPANY_SESSION_COOKIE) or request.cookies.get(PARENT_SESSION_COOKIE)
        actor = auth.actor_for_token(db, token)
        if portal_hint and actor:
            expected_role = 'observer' if portal_hint == 'company' else 'parent'
            if actor['role'] != expected_role:
                specific = request.cookies.get(COMPANY_SESSION_COOKIE if portal_hint == 'company' else PARENT_SESSION_COOKIE)
                if specific:
                    alt_actor = auth.actor_for_token(db, specific)
                    if alt_actor and alt_actor['role'] == expected_role:
                        actor = alt_actor
    if not actor:
        raise HTTPException(401, 'Please sign in to continue')
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        if not hmac.compare_digest(request.headers.get('X-CSRF-Token', ''), actor['csrf_token']):
            raise HTTPException(403, 'Your session could not be verified. Reload and try again.')
    return actor


def authorize(actor, sid=None, write=False):
    if write and actor.get('role') != 'observer':
        raise HTTPException(403, 'Only observers can change records')
    if sid and actor.get('role') != 'observer' and sid not in actor.get('students', []):
        raise HTTPException(403, 'Student is not assigned to this account')


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


Text = Annotated[str, Field(min_length=1, max_length=200)]
Note = Annotated[str, Field(max_length=4000)]
Score = Annotated[float, Field(ge=0, le=100)]


class StudentCreate(StrictModel):
    id: Annotated[str, Field(pattern=r'^[a-z0-9_-]{1,64}$')] = Field(default_factory=lambda: uuid.uuid4().hex)
    name: Text
    age: int = Field(ge=4, le=25)
    world_tier: Literal['genesis', 'hyper', 'imperium', 'meta'] = 'genesis'
    target_sessions: int = Field(default=50, ge=1, le=1000)


Username = Annotated[str, Field(pattern=r'^[a-z0-9][a-z0-9._@+\-]{2,79}$')]
Password = Annotated[str, Field(min_length=12, max_length=128)]


class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: Annotated[str, Field(min_length=1, max_length=80)]
    password: Annotated[str, Field(min_length=1, max_length=128)]
    portal: Literal['parent', 'company']


class DemoLogin(BaseModel):
    model_config = ConfigDict(extra='forbid')
    portal: Literal['parent', 'company']


def ensure_demo_accounts(db):
    sample_students = [
        ('demo-aarav', 'Aarav Sharma (Sample)', 12, 'hyper', 24, 'Robotics', 1.5,
         [
             ('Motor circuit', 'Connect a battery, switch and motor.', [50, 50, 25, 50, None, 50, None, 50]),
             ('Moving rover', 'Build a chassis and compare wheel sizes.', [50, 50, 50, 50, None, 50, None, 50]),
             ('Distance sensor', 'Measure sensor readings at three distances.', [50, 75, 50, 50, None, 50, None, 75]),
             ('Obstacle detection', 'Program a rover to stop before an obstacle.', [75, 75, 50, 75, None, 75, None, 75]),
             ('Route challenge', 'Test and refine a route around two obstacles.', [75, 75, 75, 75, None, 75, None, 75]),
             ('Rover demonstration', 'Explain the design and demonstrate a new route.', [75, 100, 75, 75, None, 75, None, 100]),
         ],
         'Compared test runs and recorded the result; used mentor prompts to identify the next design change.',
         'Test the rover on a new surface and explain how traction changes its movement.',
         'Used recorded measurements to explain a design choice.',
         'Practice changing one variable at a time during testing.',
         [4, 9]),
        ('demo-ananya', 'Ananya Patel (Sample)', 10, 'genesis', 20, 'Code Craft', 2.0,
         [
             ('Interactive storyboard', 'Sketch characters and map two story branches.', [None, 50, None, 50, 75, 50, None, 50]),
             ('Animated story', 'Use events and loops to animate a branching story.', [None, 75, None, 50, 75, 50, None, 75]),
             ('Story playtest', 'Collect peer feedback and revise the story controls.', [None, 75, None, 75, 100, 75, None, 75]),
         ],
         'Created a story scene, tested the interaction with a peer, and revised it using their feedback.',
         'Add a second ending and ask a peer to test both story paths.',
         'Connected a button event to a character animation independently.',
         'Use a checklist to test each branch before sharing.',
         [4, 9])
    ]
    for sid, sname, sage, tier, target, zone, hours, projects, notes, plan, breakthrough, support, sdgs in sample_students:
        if not db.execute('SELECT id FROM students WHERE id=?', (sid,)).fetchone():
            data = {'id': sid, 'name': sname, 'age': sage, 'world_tier': tier, 'target_sessions': target}
            db.execute('INSERT INTO students VALUES (?,?)', (sid, json.dumps(data)))
            for idx, (p_title, exp, rubric) in enumerate(projects):
                obs_id = f'init-obs-{sid}-{idx}'
                obs_date = str(date.today() - timedelta(days=(len(projects) - idx) * 7))
                created = datetime.now(timezone.utc).isoformat()
                obs_data = {
                    'id': obs_id, 'student_id': sid, 'observed_on': obs_date,
                    'created_at': created, 'session_hours': hours, 'zone_name': zone,
                    'project_title': p_title, 'signature_experience': exp,
                    'mentor_notes': notes, 'action_plan': plan,
                    'breakthrough_note': breakthrough, 'friction_note': support,
                    'steamre_rubric': rubric,
                    'behavioral_scores': {'curiosity': 3, 'autonomy': 3, 'collaboration': 3},
                    'sdgs': sdgs, 'observer_name': 'Edutainal Mentor'
                }
                db.execute('INSERT OR IGNORE INTO observations VALUES (?,?,?,?,?)',
                           (obs_id, sid, obs_date, created, json.dumps(obs_data)))

    if not db.execute('SELECT id FROM users WHERE username=?', ('company.admin',)).fetchone():
        admin_id = uuid.uuid4().hex
        db.execute('INSERT INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)',
                   (admin_id, 'company.admin', 'Company Mentor & Admin', auth.hash_password('DemoPassword123!'), 'observer'))

    parent = db.execute('SELECT id FROM users WHERE username=?', ('parent.aarav',)).fetchone()
    if not parent:
        parent_id = uuid.uuid4().hex
        db.execute('INSERT INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)',
                   (parent_id, 'parent.aarav', 'Aarav Parent (Priya Sharma)', auth.hash_password('DemoPassword123!'), 'parent'))
        db.execute('INSERT OR IGNORE INTO parent_children VALUES (?,?)', (parent_id, 'demo-aarav'))
        db.execute('INSERT OR IGNORE INTO parent_children VALUES (?,?)', (parent_id, 'demo-ananya'))


@app.post('/api/v1/auth/demo-login')
def demo_login(payload: DemoLogin, response: Response):
    """Dev/staging only endpoint. Returns 403 in production mode."""
    if os.environ.get('PORTAL_MODE') == 'production':
        raise HTTPException(403, 'Demo login is not available in production mode.')
    with database() as db:
        ensure_demo_accounts(db)
        target_role = 'observer' if payload.portal == 'company' else 'parent'
        username = 'company.admin' if target_role == 'observer' else 'parent.aarav'
        user = db.execute('SELECT id, role FROM users WHERE username=?', (username,)).fetchone()
        if not user:
            raise HTTPException(500, 'Unable to locate demo account')
        token = auth.create_session(db, user['id'])

    cookie_name = COMPANY_SESSION_COOKIE if target_role == 'observer' else PARENT_SESSION_COOKIE
    response.set_cookie(cookie_name, token, max_age=auth.SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIES, samesite='strict', path='/')
    response.set_cookie(auth.SESSION_COOKIE, token, max_age=auth.SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIES, samesite='strict', path='/')
    return {'redirect': '/company' if target_role == 'observer' else '/parent', 'username': username}


class GoogleAuthPayload(BaseModel):
    model_config = ConfigDict(extra='ignore')
    credential: str | None = None
    email: str | None = None
    name: str | None = None


@app.post('/api/v1/auth/google')
def google_auth(payload: GoogleAuthPayload, response: Response):
    """
    Authenticate a parent via Google Identity Services.
    - When GOOGLE_CLIENT_ID is set: requires a real Google JWT `credential` token.
      Plain {email, name} payloads are rejected in that mode.
    - When GOOGLE_CLIENT_ID is NOT set (dev/no-config): accepts {email, name}
      directly for developer convenience. This mode is never reached in production
      when PORTAL_MODE=production or GOOGLE_CLIENT_ID is configured.
    """
    client_id = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
    email = None
    name = None

    if payload.credential:
        if client_id:
            # Real Google JWT verification path (production)
            try:
                from google.oauth2 import id_token
                from google.auth.transport import requests as google_requests
                idinfo = id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
                email = idinfo.get('email', '').strip().lower()
                name = idinfo.get('name', email.split('@')[0])
                if not idinfo.get('email_verified'):
                    raise HTTPException(401, 'Google account email is not verified')
            except HTTPException:
                raise
            except Exception as ex:
                raise HTTPException(401, f'Invalid Google credential: {ex}')
        else:
            # Dev fallback: decode JWT claims without signature verification
            try:
                import base64
                parts = payload.credential.split('.')
                if len(parts) >= 2:
                    padded = parts[1] + '=' * (4 - len(parts[1]) % 4)
                    claims = json.loads(base64.urlsafe_b64decode(padded))
                    email = claims.get('email', '').strip().lower()
                    name = claims.get('name', email.split('@')[0])
            except Exception as ex:
                raise HTTPException(401, f'Invalid Google credential: {ex}')
    elif payload.email:
        if client_id or os.environ.get('PORTAL_MODE') == 'production':
            # In production or when Google auth is configured, reject plain email bypass
            raise HTTPException(401, 'A valid Google credential token is required. Please sign in with Google.')
        # Dev-only convenience: accept plain email when no GOOGLE_CLIENT_ID is configured
        email = payload.email.strip().lower()
        name = payload.name or email.split('@')[0]
    else:
        raise HTTPException(400, 'Google credential or verified email is required')

    if not email:
        raise HTTPException(400, 'Unable to identify Google account email')

    with database() as db:
        if os.environ.get('PORTAL_MODE') != 'production':
            ensure_demo_accounts(db)
        user = db.execute("SELECT id, username, name, role, active FROM users WHERE (username=? OR username=?) AND role='parent'",
                          (email, email.split('@')[0])).fetchone()

        if not user:
            # Auto-provision parent account for verified Google users
            user_id = uuid.uuid4().hex
            dummy_hash = auth.hash_password(secrets.token_urlsafe(32))
            display_name = name or email.split('@')[0].capitalize()
            db.execute("INSERT INTO users (id, username, name, password_hash, role) VALUES (?, ?, ?, ?, 'parent')",
                       (user_id, email, display_name, dummy_hash))
            # In dev mode, link to sample students
            if os.environ.get('PORTAL_MODE') != 'production':
                for sid in ['demo-aarav', 'demo-ananya']:
                    if db.execute('SELECT 1 FROM students WHERE id=?', (sid,)).fetchone():
                        db.execute('INSERT OR IGNORE INTO parent_children VALUES (?, ?)', (user_id, sid))
            user = {'id': user_id, 'username': email, 'name': display_name, 'role': 'parent', 'active': 1}

        if not user['active']:
            raise HTTPException(403, 'Account is deactivated. Please contact the school.')

        token = auth.create_session(db, user['id'])

    response.set_cookie(PARENT_SESSION_COOKIE, token, max_age=auth.SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIES, samesite='strict', path='/')
    response.set_cookie(auth.SESSION_COOKIE, token, max_age=auth.SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIES, samesite='strict', path='/')
    return {'redirect': '/parent', 'name': user['name'], 'email': email}


class ParentCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: Username
    name: Text
    password: Password
    students: list[Text] = Field(default_factory=list, max_length=100)


class ChildAssignments(StrictModel):
    students: list[Text] = Field(max_length=100)


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Password


@app.post('/api/v1/auth/login')
def login(payload: Login, request: Request, response: Response):
    username = payload.username.strip().lower()
    address = request.client.host if request.client else 'unknown'
    failure = False
    token = ''
    expected_role = 'observer' if payload.portal == 'company' else 'parent'
    with database() as db:
        db.execute('DELETE FROM login_attempts WHERE attempted_at<?', (time.time()-900,))
        count = db.execute('SELECT COUNT(*) FROM login_attempts WHERE address=? AND username=?', (address, username)).fetchone()[0]
        address_count = db.execute('SELECT COUNT(*) FROM login_attempts WHERE address=?', (address,)).fetchone()[0]
        if count >= 5 or address_count >= 30:
            raise HTTPException(429, 'Too many sign-in attempts. Try again in 15 minutes.')
        user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        if not user and '@' in username:
            user = db.execute('SELECT * FROM users WHERE username=?', (username.split('@')[0],)).fetchone()
        elif not user:
            user = db.execute("SELECT * FROM users WHERE username LIKE ?", (username + '@%',)).fetchone()
        valid = auth.verify_password(payload.password, user['password_hash'] if user else auth.DUMMY_PASSWORD)
        if not valid or not user or not user['active'] or user['role'] != expected_role:
            db.execute('INSERT INTO login_attempts VALUES (?,?,?)', (username, address, time.time()))
            failure = True
        else:
            portal_cookie = COMPANY_SESSION_COOKIE if expected_role == 'observer' else PARENT_SESSION_COOKIE
            old_portal = request.cookies.get(portal_cookie)
            if old_portal:
                db.execute('DELETE FROM auth_sessions WHERE token_hash=?', (auth.token_hash(old_portal),))
            db.execute('DELETE FROM login_attempts WHERE address=? AND username=?', (address, username))
            token = auth.create_session(db, user['id'])
    if failure:
        raise HTTPException(401, 'The username or password is incorrect for this portal.')
    cookie_name = COMPANY_SESSION_COOKIE if expected_role == 'observer' else PARENT_SESSION_COOKIE
    response.set_cookie(cookie_name, token, max_age=auth.SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIES, samesite='strict', path='/')
    response.set_cookie(auth.SESSION_COOKIE, token, max_age=auth.SESSION_SECONDS, httponly=True,
                        secure=SECURE_COOKIES, samesite='strict', path='/')
    return {'redirect': '/company' if expected_role == 'observer' else '/parent'}


@app.get('/api/v1/auth/me')
def me(actor=Depends(identity)):
    return actor


@app.post('/api/v1/auth/logout')
def logout(request: Request, response: Response, actor=Depends(identity)):
    with database() as db:
        for c in [auth.SESSION_COOKIE, COMPANY_SESSION_COOKIE, PARENT_SESSION_COOKIE]:
            t = request.cookies.get(c)
            if t:
                db.execute('DELETE FROM auth_sessions WHERE token_hash=?', (auth.token_hash(t),))
    for c in [auth.SESSION_COOKIE, COMPANY_SESSION_COOKIE, PARENT_SESSION_COOKIE]:
        response.delete_cookie(c, path='/', secure=SECURE_COOKIES, httponly=True, samesite='strict')
    return {'status': 'signed_out'}


@app.post('/api/v1/auth/password')
def change_password(payload: PasswordChange, response: Response, actor=Depends(identity)):
    with database() as db:
        user = db.execute('SELECT password_hash FROM users WHERE id=?', (actor['id'],)).fetchone()
        if not auth.verify_password(payload.current_password, user['password_hash']):
            raise HTTPException(400, 'Current password is incorrect')
        new_hash = auth.hash_password(payload.new_password)
        db.execute('UPDATE users SET password_hash=? WHERE id=?', (new_hash, actor['id']))
        db.execute('DELETE FROM auth_sessions WHERE user_id=?', (actor['id'],))
    supabase_client.sync_password(actor['id'], new_hash)
    response.delete_cookie(auth.SESSION_COOKIE, path='/', secure=SECURE_COOKIES, httponly=True, samesite='strict')
    return {'status': 'password_changed'}


@app.get('/api/v1/parents')
def parents(actor=Depends(identity)):
    authorize(actor, write=True)
    with database() as db:
        users = [dict(row) for row in db.execute("SELECT id,username,name FROM users WHERE role='parent' ORDER BY name")]
        for user in users:
            user['students'] = [r['student_id'] for r in db.execute('SELECT student_id FROM parent_children WHERE user_id=?', (user['id'],))]
    return users


@app.post('/api/v1/parents', status_code=201)
def create_parent(payload: ParentCreate, actor=Depends(identity)):
    authorize(actor, write=True)
    user_id = uuid.uuid4().hex
    pwhash = auth.hash_password(payload.password)
    try:
        with database() as db:
            for sid in set(payload.students):
                read_student(db, sid)
            db.execute('INSERT INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)',
                       (user_id, payload.username, payload.name.strip(), pwhash, 'parent'))
            db.executemany('INSERT INTO parent_children VALUES (?,?)', [(user_id, sid) for sid in set(payload.students)])
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'That username is already in use')
    supabase_client.sync_user(user_id, payload.username, payload.name.strip(), pwhash, 'parent')
    supabase_client.sync_parent_children(user_id, list(set(payload.students)))
    return {'id': user_id, 'username': payload.username, 'name': payload.name, 'students': list(set(payload.students))}


@app.put('/api/v1/parents/{uid}/children')
def assign_children(uid: str, payload: ChildAssignments, actor=Depends(identity)):
    authorize(actor, write=True)
    with database() as db:
        if not db.execute("SELECT id FROM users WHERE id=? AND role='parent'", (uid,)).fetchone():
            raise HTTPException(404, 'Parent account not found')
        for sid in set(payload.students):
            read_student(db, sid)
        db.execute('DELETE FROM parent_children WHERE user_id=?', (uid,))
        db.executemany('INSERT INTO parent_children VALUES (?,?)', [(uid, sid) for sid in set(payload.students)])
    broadcaster.broadcast('assignment_updated', {'parent_id': uid, 'students': list(set(payload.students))})
    supabase_client.sync_parent_children(uid, list(set(payload.students)))
    return {'status': 'updated'}


class TestResult(StrictModel):
    name: Text
    score: float = Field(ge=0)
    max_score: float = Field(gt=0)

    @model_validator(mode='after')
    def valid_score(self):
        if self.score > self.max_score:
            raise ValueError('Test score cannot exceed the maximum score')
        return self


class SessionLogCreate(StrictModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    student_id: Text
    observed_on: date = Field(default_factory=date.today)
    zone_name: Text
    project_title: Text
    signature_experience: Text
    steamre_rubric: list[Score | None] = Field(min_length=8, max_length=8)
    mentor_notes: Annotated[str, Field(min_length=10, max_length=4000)]
    action_plan: Annotated[str, Field(min_length=5, max_length=2000)]
    breakthrough_note: Note = ''
    friction_note: Note = ''
    session_hours: float = Field(default=3, gt=0, le=12)
    behavioral_scores: dict[Literal['curiosity', 'autonomy', 'collaboration'], Annotated[int, Field(ge=1, le=4)]] = Field(default_factory=dict)
    sdgs: list[Annotated[int, Field(ge=1, le=17)]] = Field(default_factory=list, max_length=17)
    test_result: TestResult | None = None

    @model_validator(mode='after')
    def evidence_rules(self):
        if self.observed_on > date.today():
            raise ValueError('An observation cannot be in the future')
        if all(v is None for v in self.steamre_rubric) and self.test_result is None:
            raise ValueError('Assess at least one observed skill or record a test result')
        if self.zone_name not in ZONES:
            raise ValueError('Unknown learning zone')
        return self


def read_student(db, sid):
    row = db.execute('SELECT data FROM students WHERE id=?', (sid,)).fetchone()
    if not row:
        raise HTTPException(404, 'Student not found')
    return json.loads(row['data'])


def read_logs(db, sid):
    return [json.loads(r['data']) for r in db.execute(
        'SELECT data FROM observations WHERE student_id=? ORDER BY observed_on, created_at, id', (sid,))]


def analytics(student, logs):
    """90-day recency-weighted means; unknown skills stay null. No synthetic prior."""
    skills = []
    for i, name in enumerate(PILLARS):
        samples = [(row['steamre_rubric'][i], 2 ** (-max(0, (date.today() - date.fromisoformat(row['observed_on'])).days) / 90), row['observed_on'])
                   for row in logs if row['steamre_rubric'][i] is not None]
        values = [v for v, w, d in samples]
        weight = sum(w for v, w, d in samples)
        mean = sum(v * w for v, w, d in samples) / weight if weight else None
        delta = round(sum(values[-3:]) / 3 - sum(values[-6:-3]) / 3, 1) if len(values) >= 6 else None
        skills.append({'name': name, 'score': round(mean, 1) if mean is not None else None,
                       'observations': len(samples), 'trend': delta,
                       'effective_samples': round(weight ** 2 / sum(w*w for v,w,d in samples), 1) if weight else 0,
                       'spread': round((sum(w*(v-mean)**2 for v,w,d in samples)/weight)**0.5, 1) if weight else None,
                       'last_observed': samples[-1][2] if samples else None})
    covered = sum(int(s['observations'] or 0) >= 3 for s in skills)
    pathways = []
    for title, indexes, activity in PATHWAYS:
        if all(int(skills[i]['observations'] or 0) >= 3 for i in indexes):
            pathways.append({'title': title, 'alignment': round(sum(float(skills[i]['score'] or 0.0) for i in indexes)/len(indexes), 1),
                             'basis': [PILLARS[i] for i in indexes], 'activity': activity})
    pathways.sort(key=lambda p: (-(p['alignment'] if isinstance(p['alignment'], (int, float)) else 0.0), str(p['title'])))
    missing = [s['name'] for s in skills if not s['observations']]
    measured = [s for s in skills if s['score'] is not None]
    focus = min(measured, key=lambda s: float(s['score'] if s['score'] is not None else 0.0)) if measured else None
    actions = []
    if logs:
        actions.append(logs[-1]['action_plan'])
    if missing:
        actions.append('Plan an activity to observe: ' + ', '.join(str(m) for m in missing) + '.')
    if focus:
        actions.append(f"Practice {focus['name']} with mentor support and collect another observation.")
    return {'student': student, 'total_sessions': len(logs),
            'total_hours': round(sum(r['session_hours'] for r in logs), 2),
            'completion_percent': min(100, round(100*len(logs)/student['target_sessions'], 1)),
            'skills': skills, 'coverage': covered, 'pathways': pathways,
            'evidence_status': 'No observations yet' if not logs else ('Developing evidence' if covered < 8 else 'Repeated observations across all skills'),
            'next_actions': actions, 'logs': list(reversed(logs)),
            'zones': [{'name': z, 'sessions': sum(r['zone_name']==z for r in logs),
                       'hours': round(sum(r['session_hours'] for r in logs if r['zone_name']==z), 2)} for z in ZONES],
            'model': {'version': 'evidence-v1', 'half_life_days': 90, 'validated_predictive_accuracy': None,
                      'note': 'Descriptive rubric evidence, not a career prediction or standardized ability assessment. Trends compare the latest three and previous three ratings of each skill; different tasks or observers may affect scores.'}}


@app.get('/', include_in_schema=False)
def landing(request: Request):
    with database() as db:
        actor = auth.actor_for_token(db, request.cookies.get(auth.SESSION_COOKIE))
    if actor:
        return RedirectResponse('/company' if actor['role'] == 'observer' else '/parent')
    return FileResponse(ROOT / 'frontend' / 'welcome.html')


@app.get('/parent/login', include_in_schema=False)
def parent_login():
    return FileResponse(ROOT / 'frontend' / 'parent-login.html')


@app.get('/company/login', include_in_schema=False)
def company_login():
    return FileResponse(ROOT / 'frontend' / 'company-login.html')


def protected_page(request: Request, role: str, filename: str):
    portal = 'company' if role == 'observer' else 'parent'
    specific_cookie = COMPANY_SESSION_COOKIE if role == 'observer' else PARENT_SESSION_COOKIE
    other_cookie = PARENT_SESSION_COOKIE if role == 'observer' else COMPANY_SESSION_COOKIE
    with database() as db:
        token = request.cookies.get(specific_cookie)
        actor = auth.actor_for_token(db, token) if token else None
        if not actor or actor['role'] != role:
            fallback = request.cookies.get(auth.SESSION_COOKIE)
            if fallback:
                f_actor = auth.actor_for_token(db, fallback)
                if f_actor and f_actor['role'] == role:
                    actor = f_actor
        if not actor or actor['role'] != role:
            other_token = request.cookies.get(other_cookie) or request.cookies.get(auth.SESSION_COOKIE)
            other_actor = auth.actor_for_token(db, other_token) if other_token else None
            if other_actor and other_actor['role'] != role:
                return RedirectResponse('/company' if other_actor['role'] == 'observer' else '/parent', status_code=303)
            return RedirectResponse(f'/{portal}/login', status_code=303)
    return FileResponse(ROOT / 'frontend' / filename)


@app.get('/api/v1/events', include_in_schema=False)
async def realtime_events(request: Request):
    q = broadcaster.subscribe()
    async def event_stream():
        try:
            yield "event: connected\ndata: {\"status\": \"ready\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            broadcaster.unsubscribe(q)

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )


@app.get('/parent', include_in_schema=False)
def parent_page(request: Request):
    return protected_page(request, 'parent', 'index.html')


@app.get('/observer', include_in_schema=False)
@app.get('/company', include_in_schema=False)
def observer_page(request: Request):
    return protected_page(request, 'observer', 'observer.html')


@app.get('/api/v1/config')
def config():
    return {
        'pillars': PILLARS,
        'zones': ZONES,
        'authentication_required': True,
        'google_client_id': os.environ.get('GOOGLE_CLIENT_ID', '')
    }


@app.get('/api/v1/health')
def health():
    with database() as db:
        db.execute('SELECT 1')
    return {'status': 'healthy'}


@app.get('/api/v1/students')
def students(actor=Depends(identity)):
    with database() as db:
        records = [json.loads(r['data']) for r in db.execute('SELECT data FROM students ORDER BY id')]
        return [s for s in records
                if actor.get('role') == 'observer' or s['id'] in actor.get('students', [])]


@app.post('/api/v1/students', status_code=201)
def enroll(payload: StudentCreate, actor=Depends(identity)):
    authorize(actor, write=True)
    record = payload.model_dump()
    try:
        with database() as db:
            db.execute('INSERT INTO students VALUES (?,?)', (payload.id, json.dumps(record)))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Student ID already exists')
    broadcaster.broadcast('student_enrolled', {'student_id': payload.id, 'name': payload.name})
    supabase_client.sync_student(payload.id, record)
    return record


@app.get('/api/v1/students/{sid}')
def student(sid: str, actor=Depends(identity)):
    authorize(actor, sid)
    with database() as db:
        return read_student(db, sid)


@app.get('/api/v1/students/{sid}/analytics')
def student_analytics(sid: str, actor=Depends(identity)):
    authorize(actor, sid)
    with database() as db:
        return analytics(read_student(db, sid), read_logs(db, sid))


@app.get('/api/v1/students/{sid}/logs')
def logs(sid: str, actor=Depends(identity)):
    return {'student_id': sid, 'logs': student_analytics(sid, actor)['logs']}


@app.get('/api/v1/career-revelation/{sid}')
def pathways(sid: str, actor=Depends(identity)):
    report = student_analytics(sid, actor)
    return {'student_id': sid, 'exploration_pathways': report['pathways'], 'model': report['model']}


@app.post('/api/v1/sessions')
def record_session(payload: SessionLogCreate, actor=Depends(identity)):
    authorize(actor, payload.student_id, write=True)
    data = payload.model_dump(mode='json')
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        read_student(db, payload.student_id)
        existing = db.execute('SELECT data FROM observations WHERE id=?', (str(payload.id),)).fetchone()
        if existing:
            old = json.loads(existing['data'])
            if any(old.get(k) != v for k, v in data.items()):
                raise HTTPException(409, 'This submission ID already has different content')
            return {'status': 'already_saved', 'session': old}
        data['observer_name'] = actor.get('name', 'Evaluator')
        data['created_at'] = datetime.now(timezone.utc).isoformat()
        db.execute('INSERT INTO observations VALUES (?,?,?,?,?)',
                   (str(payload.id), payload.student_id, str(payload.observed_on), data['created_at'], json.dumps(data)))
    broadcaster.broadcast('observation_saved', {
        'student_id': payload.student_id,
        'observation_id': str(payload.id),
        'zone_name': payload.zone_name,
        'project_title': payload.project_title,
        'observed_on': str(payload.observed_on),
        'observer_name': data['observer_name']
    })
    supabase_client.sync_observation(str(payload.id), payload.student_id, str(payload.observed_on), data['created_at'], data)
    return {'status': 'saved', 'session': data}
