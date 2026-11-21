import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from backend import main, auth, accounts
from auth_support import PASSWORD

class DualPortalSyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = main.DB_PATH
        main.DB_PATH = str(Path(self.tmp.name) / 'dual_sync.sqlite3')
        main.init_db()
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.DB_PATH = self.old_db
        self.tmp.cleanup()

    def test_split_view_is_completely_removed(self):
        # Split view route must return 404
        res = self.client.get('/split')
        self.assertEqual(res.status_code, 404)
        # Frame-ancestors must be 'none'
        res_landing = self.client.get('/')
        self.assertIn("frame-ancestors 'none'", res_landing.headers.get('content-security-policy', ''))

    def test_email_password_auth_for_parent_portal(self):
        # Ensure demo accounts exist
        with main.database() as db:
            main.ensure_demo_accounts(db)

        # 1. Sign in with Parent Email & Password
        login_payload = {
            'username': 'parent.aarav@gmail.com',
            'password': 'DemoPassword123!',
            'portal': 'parent'
        }
        res = self.client.post('/api/v1/auth/login', json=login_payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['redirect'], '/parent')

        # 2. Check parent session cookie
        parent_token = self.client.cookies.get(main.PARENT_SESSION_COOKIE)
        self.assertIsNotNone(parent_token)

        # 3. Access parent portal
        res_parent = self.client.get('/parent', follow_redirects=False)
        self.assertEqual(res_parent.status_code, 200)
        self.assertIn('data-role="parent"', res_parent.text)

        # 4. Identity verification confirms role
        me = self.client.get('/api/v1/auth/me', headers={'X-Portal': 'parent'}).json()
        self.assertEqual(me['role'], 'parent')

    def test_secure_company_login_with_id_and_password(self):
        # Ensure demo accounts exist
        with main.database() as db:
            main.ensure_demo_accounts(db)

        # Sign in to company workspace with login ID and password
        login_payload = {
            'username': 'company.admin',
            'password': 'DemoPassword123!',
            'portal': 'company'
        }
        res = self.client.post('/api/v1/auth/login', json=login_payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['redirect'], '/company')

        # Check company session cookie
        comp_token = self.client.cookies.get(main.COMPANY_SESSION_COOKIE)
        self.assertIsNotNone(comp_token)

        # Access company page
        res_comp = self.client.get('/company', follow_redirects=False)
        self.assertEqual(res_comp.status_code, 200)
        self.assertIn('data-role="observer"', res_comp.text)

    def test_simultaneous_dual_sessions_parent_and_company(self):
        # 1. Company login with ID and Password
        with main.database() as db:
            main.ensure_demo_accounts(db)
        self.client.post('/api/v1/auth/login', json={'username': 'company.admin', 'password': 'DemoPassword123!', 'portal': 'company'})

        # 2. Parent login with Email and Password
        self.client.post('/api/v1/auth/login', json={'username': 'parent.aarav@gmail.com', 'password': 'DemoPassword123!', 'portal': 'parent'})

        # 3. Both session cookies exist simultaneously
        self.assertIn(main.COMPANY_SESSION_COOKIE, self.client.cookies)
        self.assertIn(main.PARENT_SESSION_COOKIE, self.client.cookies)

        # 4. Both portals remain accessible without redirection
        self.assertEqual(self.client.get('/company', follow_redirects=False).status_code, 200)
        self.assertEqual(self.client.get('/parent', follow_redirects=False).status_code, 200)

    def test_realtime_broadcaster_event_dispatch(self):
        q = main.broadcaster.subscribe()
        try:
            with main.database() as db:
                main.ensure_demo_accounts(db)
            self.client.post('/api/v1/auth/login', json={'username': 'company.admin', 'password': 'DemoPassword123!', 'portal': 'company'})
            actor = self.client.get('/api/v1/auth/me', headers={'X-Portal': 'company'}).json()

            payload = {
                'student_id': 'demo-aarav',
                'zone_name': 'Robotics',
                'project_title': 'Sync Rover Test',
                'signature_experience': 'Real-time telemetry test',
                'steamre_rubric': [75, 75, 50, 75, 50, 75, 50, 75],
                'mentor_notes': 'Verified real-time broadcast to subscribers.',
                'action_plan': 'Next real-time milestone.'
            }
            res = self.client.post('/api/v1/sessions', json=payload, headers={'X-Portal': 'company', 'X-CSRF-Token': actor['csrf_token']})
            self.assertEqual(res.status_code, 200)

            self.assertFalse(q.empty())
            msg = q.get_nowait()
            self.assertIn('event: observation_saved', msg)
            self.assertIn('demo-aarav', msg)
        finally:
            main.broadcaster.unsubscribe(q)
