import tempfile
import unittest
from pathlib import Path
from uuid import uuid4
from fastapi.testclient import TestClient
from backend import main, accounts
from auth_support import company, login, PASSWORD

class AssessmentTests(unittest.TestCase):
    def test_marks_and_replay(self):
        old_db = main.DB_PATH
        with tempfile.TemporaryDirectory() as folder:
            main.DB_PATH = str(Path(folder) / 'test.sqlite3')
            try:
                with TestClient(main.app) as client:
                    company(client)
                    client.post('/api/v1/students', json={'id':'test','name':'Test learner','age':12})
                    payload = dict(id=str(uuid4()), student_id='test', zone_name='Robotics',
                        project_title='Circuit test', signature_experience='Explain a circuit',
                        steamre_rubric=[50,None,None,None,None,None,None,None],
                        mentor_notes='Explained the circuit with a diagram.', action_plan='Try a parallel circuit.')
                    for score, maximum in [(21,20),(-1,20),(0,0)]:
                        payload['test_result'] = {'name':'Circuits','score':score,'max_score':maximum}
                        self.assertEqual(client.post('/api/v1/sessions',json=payload).status_code,422)
                    payload['test_result'] = {'name':'Circuits','score':15,'max_score':20}
                    self.assertEqual(client.post('/api/v1/sessions',json=payload).status_code,200)
                    self.assertEqual(client.post('/api/v1/sessions',json=payload).json()['status'],'already_saved')
                    report = client.get('/api/v1/students/test/analytics').json()
                    self.assertEqual(report['total_sessions'],1)
                    self.assertEqual(report['logs'][0]['test_result'],payload['test_result'])
                    payload['id'] = str(uuid4())
                    payload['steamre_rubric'] = [None] * 8
                    self.assertEqual(client.post('/api/v1/sessions',json=payload).status_code,200)
                    report = client.get('/api/v1/students/test/analytics').json()
                    self.assertEqual(report['skills'][0]['observations'],1)
                    accounts.add_user('test.parent','Parent tester',PASSWORD,'parent',['test'])
                    login(client,'test.parent','parent')
                    self.assertEqual(client.get('/api/v1/students/test/analytics').status_code,200)
                    self.assertEqual(client.post('/api/v1/sessions',json=payload).status_code,403)
            finally:
                main.DB_PATH = old_db
