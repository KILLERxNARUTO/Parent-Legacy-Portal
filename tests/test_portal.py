import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
from fastapi.testclient import TestClient
from backend import main, accounts
from auth_support import company, login, PASSWORD

class PortalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_db = main.DB_PATH
        main.DB_PATH = str(Path(self.tmp.name) / 'test.sqlite3')
        self.client = TestClient(main.app)
        self.client.__enter__()
        company(self.client)
        self.client.post('/api/v1/students', json={'id':'learner','name':'Learner','age':10})

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.DB_PATH = self.old_db
        self.tmp.cleanup()

    def payload(self):
        return dict(id=str(uuid4()), student_id='learner', zone_name='Robotics',
                    project_title='A moving robot', signature_experience='Test a motor',
                    steamre_rubric=[50,75,None,75,None,50,None,None],
                    mentor_notes='Built the motor circuit with one prompt.',
                    action_plan='Test a second motor independently.', session_hours=1.5)

    def report(self):
        return self.client.get('/api/v1/students/learner/analytics').json()

    def test_empty_state(self):
        r = self.report()
        self.assertEqual(r['total_sessions'],0)
        self.assertTrue(all(s['score'] is None for s in r['skills']))
        self.assertEqual(r['pathways'],[])

    def test_persistence_and_hours(self):
        p = self.payload()
        self.assertEqual(self.client.post('/api/v1/sessions',json=p).status_code,200)
        main.init_db()
        r = self.report()
        self.assertEqual(r['total_hours'],1.5)
        self.assertEqual(r['skills'][0]['score'],50)
        self.assertIsNone(r['skills'][2]['score'])
        self.assertEqual(r['logs'][0]['steamre_rubric'],p['steamre_rubric'])

    def test_concurrent_retry(self):
        p = self.payload()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.client.post('/api/v1/sessions',json=p).status_code,range(4)))
        self.assertEqual(results,[200]*4)
        self.assertEqual(self.report()['total_sessions'],1)
        p['mentor_notes'] = 'Different content for the same ID.'
        self.assertEqual(self.client.post('/api/v1/sessions',json=p).status_code,409)

    def test_validation(self):
        for field,value in [('steamre_rubric',[101]*8),('steamre_rubric',[-1]*8),('steamre_rubric',[None]*8),('steamre_rubric',[50]*7),('session_hours',0),('session_hours',13),('observed_on','2999-01-01'),('zone_name','Unknown'),('behavioral_scores',{'curiosity':5}),('sdgs',[18])]:
            p = self.payload(); p[field] = value
            self.assertEqual(self.client.post('/api/v1/sessions',json=p).status_code,422,(field,value))
        self.assertEqual(self.report()['total_sessions'],0)

    def test_backdating_and_trends(self):
        for i in reversed(range(6)):
            p = self.payload(); p['observed_on'] = f'2025-01-{i+1:02}'
            p['steamre_rubric'] = [25 if i<3 else 75]*8
            self.client.post('/api/v1/sessions',json=p)
        r = self.report()
        self.assertEqual(r['skills'][0]['trend'],50)
        self.assertEqual(r['logs'][0]['observed_on'],'2025-01-06')
        self.assertGreater(r['skills'][0]['score'],50)
        self.assertEqual(r['coverage'],8)

    def test_pathway_evidence_threshold(self):
        for _ in range(2): self.client.post('/api/v1/sessions',json=self.payload())
        self.assertEqual(self.report()['pathways'],[])
        self.client.post('/api/v1/sessions',json=self.payload())
        self.assertEqual(len(self.report()['pathways']),1)
        self.assertEqual(self.report()['pathways'][0]['title'],'Robotics and engineering')

    def test_parent_access(self):
        accounts.add_user('test.parent','Parent tester',PASSWORD,'parent',['learner'])
        accounts.add_user('test.other','Other parent',PASSWORD,'parent')
        self.client.post('/api/v1/auth/logout',json={})
        self.assertEqual(self.client.get('/api/v1/students').status_code,401)
        login(self.client,'test.parent','parent')
        self.assertEqual(len(self.client.get('/api/v1/students').json()),1)
        self.assertEqual(self.client.post('/api/v1/sessions',json=self.payload()).status_code,403)
        self.assertEqual(self.client.post('/api/v1/students',json={'name':'Other','age':12}).status_code,403)
        login(self.client,'test.other','parent')
        self.assertEqual(self.client.get('/api/v1/students/learner/analytics').status_code,403)
        self.assertEqual(self.client.get('/api/v1/students/learner/logs').status_code,403)
        self.assertEqual(self.client.get('/api/v1/students').json(),[])

    def test_duplicate_and_missing_student(self):
        self.assertEqual(self.client.post('/api/v1/students',json={'id':'learner','name':'Other','age':12}).status_code,409)
        self.assertEqual(self.client.get('/api/v1/students/missing/analytics').status_code,404)

if __name__ == '__main__': unittest.main()
