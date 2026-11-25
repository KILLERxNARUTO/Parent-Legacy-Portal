import tempfile
import unittest
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
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
            self.assertEqual(msg['type'], 'observation_saved')
            self.assertEqual(msg['data']['student_id'], 'demo-aarav')
        finally:
            main.broadcaster.unsubscribe(q)

    def sign_in(self, portal):
        username = 'company.admin' if portal == 'company' else 'parent.aarav'
        result = self.client.post('/api/v1/auth/login', json={
            'username': username, 'password': 'DemoPassword123!', 'portal': portal,
        })
        self.assertEqual(result.status_code, 200)
        return self.client.get('/api/v1/auth/me', headers={'X-Portal': portal}).json()

    def test_parent_request_never_borrows_company_session(self):
        actor = self.sign_in('company')
        headers = {'X-Portal': 'parent', 'X-CSRF-Token': actor['csrf_token']}
        for path in ['/auth/me', '/students', '/students/demo-aarav/analytics', '/parents']:
            self.assertEqual(self.client.get('/api/v1' + path, headers=headers).status_code, 401)
        self.assertEqual(self.client.post('/api/v1/students', headers=headers,
                                         json={'name': 'Unscoped child', 'age': 10}).status_code, 401)
        self.assertEqual(self.client.get('/parent', follow_redirects=False).headers['location'], '/parent/login')
        self.assertEqual(self.client.get('/api/v1/students', headers={'X-Portal': 'invalid'}).status_code, 400)

    def test_company_request_never_borrows_parent_session(self):
        self.sign_in('parent')
        self.assertEqual(self.client.get('/api/v1/auth/me', headers={'X-Portal': 'company'}).status_code, 401)
        self.assertEqual(self.client.get('/company', follow_redirects=False).headers['location'], '/company/login')

    def test_both_login_orders_keep_data_and_renderers_separate(self):
        for order in [('parent', 'company'), ('company', 'parent')]:
            with self.subTest(order=order):
                self.client.cookies.clear()
                for portal in order:
                    self.sign_in(portal)
                parent_headers, company_headers = {'X-Portal': 'parent'}, {'X-Portal': 'company'}
                parent = self.client.get('/api/v1/auth/me', headers=parent_headers).json()
                roster = self.client.get('/api/v1/students', headers=parent_headers).json()
                self.assertEqual({student['id'] for student in roster}, set(parent['students']))
                self.assertEqual(self.client.get('/api/v1/parents', headers=parent_headers).status_code, 403)
                self.assertEqual(self.client.get('/api/v1/parents', headers=company_headers).status_code, 200)
                parent_html = self.client.get('/parent').text
                company_html = self.client.get('/company').text
                self.assertIn('/static/dashboard.js', parent_html)
                self.assertNotIn('/static/company-dashboard.js', parent_html)
                self.assertNotIn('id="parent-accounts"', parent_html)
                self.assertIn('/static/company-dashboard.js', company_html)
                self.assertNotIn('/static/dashboard.js', company_html)

    def test_expired_portal_does_not_fall_back_to_other_session(self):
        self.sign_in('parent')
        self.sign_in('company')
        with main.database() as db:
            db.execute('UPDATE auth_sessions SET expires_at=0 WHERE token_hash=?',
                       (auth.token_hash(self.client.cookies.get(main.PARENT_SESSION_COOKIE)),))
        self.assertEqual(self.client.get('/api/v1/students', headers={'X-Portal': 'parent'}).status_code, 401)
        self.assertEqual(self.client.get('/api/v1/students', headers={'X-Portal': 'company'}).status_code, 200)

    def test_logout_only_ends_selected_portal(self):
        for portal, other in [('parent', 'company'), ('company', 'parent')]:
            with self.subTest(portal=portal):
                actors = {name: self.sign_in(name) for name in ('parent', 'company')}
                response = self.client.post('/api/v1/auth/logout', json={}, headers={
                    'X-Portal': portal, 'X-CSRF-Token': actors[portal]['csrf_token'],
                })
                self.assertEqual(response.status_code, 200)
                self.assertEqual(self.client.get('/api/v1/auth/me', headers={'X-Portal': portal}).status_code, 401)
                self.assertEqual(self.client.get('/api/v1/auth/me', headers={'X-Portal': other}).status_code, 200)

    def test_live_stream_requires_matching_portal_login(self):
        self.assertEqual(self.client.get('/api/v1/events?portal=parent').status_code, 401)
        self.sign_in('company')
        self.assertEqual(self.client.get('/api/v1/events?portal=parent').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/events').status_code, 400)

    def test_live_stream_filters_updates_and_rechecks_access(self):
        actor = self.sign_in('parent')
        request = SimpleNamespace(
            headers={'X-Portal': 'parent'}, cookies=dict(self.client.cookies),
            url=SimpleNamespace(path='/api/v1/events'), query_params={}, method='GET',
            is_disconnected=AsyncMock(return_value=False),
        )

        async def check_stream():
            response = await main.realtime_events(request, actor)
            stream = response.body_iterator
            try:
                self.assertIn('event: connected', await anext(stream))
                main.broadcaster.broadcast('student_enrolled', {'student_id': 'another-child', 'name': 'Private child'})
                main.broadcaster.broadcast('assignment_updated', {'parent_id': 'another-parent', 'students': ['another-child']})
                main.broadcaster.broadcast('observation_saved', {'student_id': 'demo-aarav', 'project_title': 'Assigned child evidence'})
                update = await asyncio.wait_for(anext(stream), timeout=1)
                self.assertIn('Assigned child evidence', update)
                self.assertNotIn('Private child', update)

                # A queued observation must be filtered using the latest access,
                # not the permissions captured when the stream opened.
                main.broadcaster.broadcast('observation_saved', {'student_id': 'demo-aarav', 'project_title': 'Revoked evidence'})
                with main.database() as db:
                    db.execute('DELETE FROM parent_children WHERE user_id=?', (actor['id'],))
                main.broadcaster.broadcast('assignment_updated', {'parent_id': actor['id'], 'students': []})
                update = await asyncio.wait_for(anext(stream), timeout=1)
                self.assertIn('assignment_updated', update)
                self.assertNotIn('Revoked evidence', update)

                with main.database() as db:
                    db.execute('DELETE FROM auth_sessions WHERE user_id=?', (actor['id'],))
                main.broadcaster.broadcast('observation_saved', {'student_id': 'demo-aarav'})
                self.assertIn('session_expired', await asyncio.wait_for(anext(stream), timeout=1))
            finally:
                await stream.aclose()
            self.assertEqual(len(main.broadcaster._subscribers), 0)

        asyncio.run(check_stream())
