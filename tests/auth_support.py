from backend import accounts

PASSWORD = 'Test-password-2026!'

def login(client, username='test.company', portal='company', password=PASSWORD):
    response = client.post('/api/v1/auth/login', json={'username':username,'password':password,'portal':portal})
    assert response.status_code == 200, response.text
    actor = client.get('/api/v1/auth/me').json()
    client.headers['X-CSRF-Token'] = actor['csrf_token']
    return actor

def company(client):
    accounts.add_user('test.company','Company tester',PASSWORD,'observer')
    return login(client)
