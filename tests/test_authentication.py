import tempfile
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from backend import main, auth, accounts
from auth_support import company, login, PASSWORD

class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = main.DB_PATH
        main.DB_PATH = str(Path(self.tmp.name)/'auth.sqlite3')
        self.client = TestClient(main.app)
        self.client.__enter__()
        company(self.client)
        for sid in ['child-a','sibling-a','child-b']:
            self.client.post('/api/v1/students',json={'id':sid,'name':sid,'age':10})
        accounts.add_user('parent.a','Parent A',PASSWORD,'parent',['child-a','sibling-a'])
        accounts.add_user('parent.b','Parent B',PASSWORD,'parent',['child-b'])

    def tearDown(self):
        self.client.__exit__(None,None,None)
        main.DB_PATH = self.old_db
        self.tmp.cleanup()

    def test_anonymous_and_portal_separation(self):
        self.client.post('/api/v1/auth/logout',json={})
        for path in ['/students','students/child-a/analytics','/students/child-a/logs','/career-revelation/child-a','/parents']:
            self.assertEqual(self.client.get('/api/v1/'+path.lstrip('/')).status_code,401)
        for page,target in [('/parent','/parent/login'),('/company','/company/login'),('/observer','/company/login')]:
            response=self.client.get(page,follow_redirects=False)
            self.assertEqual(response.status_code,303)
            self.assertEqual(response.headers['location'],target)
        self.assertEqual(self.client.get('/static/index.html').status_code,404)
        self.assertEqual(self.client.post('/api/v1/auth/login',json={'username':'parent.a','password':PASSWORD,'portal':'company'}).status_code,401)
        login(self.client,'parent.a','parent')
        self.assertEqual(self.client.get('/company',follow_redirects=False).headers['location'],'/company/login')
        self.assertNotIn('Company workspace',self.client.get('/parent').text)

    def test_parent_scope_on_every_endpoint_and_mutation(self):
        login(self.client,'parent.a','parent')
        self.assertEqual({s['id'] for s in self.client.get('/api/v1/students').json()},{'child-a','sibling-a'})
        for suffix in ['', '/analytics', '/logs']:
            self.assertEqual(self.client.get('/api/v1/students/child-a'+suffix).status_code,200)
            self.assertEqual(self.client.get('/api/v1/students/child-b'+suffix).status_code,403)
        self.assertEqual(self.client.get('/api/v1/career-revelation/child-b').status_code,403)
        self.assertEqual(self.client.get('/api/v1/parents').status_code,403)
        self.assertEqual(self.client.post('/api/v1/students',json={'name':'Injected','age':10}).status_code,403)
        self.assertEqual(self.client.post('/api/v1/parents',json={'username':'new.parent','name':'Other','password':PASSWORD,'students':['child-b']}).status_code,403)
        login(self.client,'parent.b','parent')
        self.assertEqual([s['id'] for s in self.client.get('/api/v1/students').json()],['child-b'])

    def test_session_cookie_csrf_logout_and_expiry(self):
        response=self.client.post('/api/v1/auth/login',json={'username':'parent.a','password':PASSWORD,'portal':'parent'})
        cookie=response.headers['set-cookie'].lower()
        self.assertIn('httponly',cookie);self.assertIn('samesite=strict',cookie)
        actor=self.client.get('/api/v1/auth/me').json()
        token=self.client.cookies.get(auth.SESSION_COOKIE)
        self.client.headers.pop('X-CSRF-Token',None)
        self.assertEqual(self.client.post('/api/v1/auth/logout',json={}).status_code,403)
        self.client.headers['X-CSRF-Token']=actor['csrf_token']
        self.assertEqual(self.client.post('/api/v1/auth/logout',json={},headers={'Origin':'https://untrusted.example'}).status_code,403)
        self.assertEqual(self.client.post('/api/v1/auth/logout',json={}).status_code,200)
        self.client.cookies.set(auth.SESSION_COOKIE,token)
        self.assertEqual(self.client.get('/api/v1/auth/me').status_code,401)
        self.client.cookies.clear()
        login(self.client,'parent.a','parent')
        with main.database() as db: db.execute('UPDATE auth_sessions SET expires_at=?',(time.time()-1,))
        self.assertEqual(self.client.get('/api/v1/students').status_code,401)

    def test_company_assignments_are_immediate_and_atomic(self):
        response=self.client.post('/api/v1/parents',json={'username':'parent.new','name':'New parent','password':PASSWORD,'students':['child-a']})
        self.assertEqual(response.status_code,201)
        uid=response.json()['id']
        self.assertNotIn('password',response.json())
        parent=TestClient(main.app)
        login(parent,'parent.new','parent')
        self.assertEqual(len(parent.get('/api/v1/students').json()),1)
        self.assertEqual(self.client.put(f'/api/v1/parents/{uid}/children',json={'students':['missing']}).status_code,404)
        self.assertEqual(len(parent.get('/api/v1/students').json()),1)
        self.assertEqual(self.client.put(f'/api/v1/parents/{uid}/children',json={'students':[]}).status_code,200)
        self.assertEqual(parent.get('/api/v1/students').json(),[])
        self.assertEqual(parent.get('/api/v1/students/child-a/analytics').status_code,403)
        self.assertEqual(parent.put(f'/api/v1/parents/{uid}/children',json={'students':['child-a']}).status_code,403)
        parent.close()

    def test_password_change_revokes_other_sessions(self):
        login(self.client,'parent.a','parent')
        other=TestClient(main.app)
        login(other,'parent.a','parent')
        new_password='New-password-2026!'
        response=self.client.post('/api/v1/auth/password',json={'current_password':PASSWORD,'new_password':new_password})
        self.assertEqual(response.status_code,200)
        self.assertEqual(other.get('/api/v1/students').status_code,401)
        self.assertEqual(self.client.post('/api/v1/auth/login',json={'username':'parent.a','password':PASSWORD,'portal':'parent'}).status_code,401)
        login(self.client,'parent.a','parent',new_password)
        with main.database() as db:
            stored=db.execute("SELECT password_hash FROM users WHERE username='parent.a'").fetchone()[0]
            self.assertNotIn(new_password,stored)
            self.assertTrue(auth.verify_password(new_password,stored))
        other.close()

    def test_failed_login_throttling_and_no_role_injection(self):
        for _ in range(5):
            self.assertEqual(self.client.post('/api/v1/auth/login',json={'username':'unknown.user','password':'wrong','portal':'parent'}).status_code,401)
        self.assertEqual(self.client.post('/api/v1/auth/login',json={'username':'unknown.user','password':'wrong','portal':'parent'}).status_code,429)
        self.assertEqual(self.client.post('/api/v1/auth/login',json={'username':'parent.a','password':PASSWORD,'portal':'parent','role':'observer'}).status_code,422)
