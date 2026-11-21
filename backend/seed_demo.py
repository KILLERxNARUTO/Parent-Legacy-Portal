"""Add fictional demo records through the running local portal API.

Run: python -m backend.seed_demo
Existing records are preserved; repeat runs skip already saved sample sessions.
"""
import json
import argparse
import os
from datetime import date, timedelta
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5

BACKEND_BASE = os.environ.get('BACKEND_URL', 'http://127.0.0.1:8000').rstrip('/')
BASE_URL = f'{BACKEND_BASE}/api/v1'


def api(path, payload=None):
    request = Request(
        BASE_URL + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except HTTPError as error:
        raise RuntimeError(f'{path}: {error.code} {error.read().decode()}') from error


DEMO_STUDENTS = [
    {
        'id': 'demo-aarav', 'name': 'Aarav Sharma (Sample)', 'age': 12,
        'world_tier': 'hyper', 'target_sessions': 24,
        'zone': 'Robotics', 'hours': 1.5,
        'projects': [
            ('Motor circuit', 'Connect a battery, switch and motor.', [50, 50, 25, 50, None, 50, None, 50]),
            ('Moving rover', 'Build a chassis and compare wheel sizes.', [50, 50, 50, 50, None, 50, None, 50]),
            ('Distance sensor', 'Measure sensor readings at three distances.', [50, 75, 50, 50, None, 50, None, 75]),
            ('Obstacle detection', 'Program a rover to stop before an obstacle.', [75, 75, 50, 75, None, 75, None, 75]),
            ('Route challenge', 'Test and refine a route around two obstacles.', [75, 75, 75, 75, None, 75, None, 75]),
            ('Rover demonstration', 'Explain the design and demonstrate a new route.', [75, 100, 75, 75, None, 75, None, 100]),
        ],
        'notes': 'Compared test runs and recorded the result; used mentor prompts to identify the next design change.',
        'plan': 'Test the rover on a new surface and explain how traction changes its movement.',
        'breakthrough': 'Used recorded measurements to explain a design choice.',
        'support': 'Practice changing one variable at a time during testing.',
        'sdgs': [4, 9],
    },
    {
        'id': 'demo-ananya', 'name': 'Ananya Patel (Sample)', 'age': 10,
        'world_tier': 'genesis', 'target_sessions': 20,
        'zone': 'Code Craft', 'hours': 2,
        'projects': [
            ('Interactive storyboard', 'Sketch characters and map two story branches.', [None, 50, None, 50, 75, 50, None, 50]),
            ('Animated story', 'Use events and loops to animate a branching story.', [None, 75, None, 50, 75, 50, None, 75]),
            ('Story playtest', 'Collect peer feedback and revise the story controls.', [None, 75, None, 75, 100, 75, None, 75]),
        ],
        'notes': 'Created a story scene, tested the interaction with a peer, and revised it using their feedback.',
        'plan': 'Add a second ending and ask a peer to test both story paths.',
        'breakthrough': 'Connected a button event to a character animation independently.',
        'support': 'Use a checklist to test each branch before sharing.',
        'sdgs': [4],
    },
    {
        'id': 'demo-kabir', 'name': 'Kabir Rao (Sample)', 'age': 14,
        'world_tier': 'imperium', 'target_sessions': 30,
        'zone': 'Space Science', 'hours': 2.5,
        'projects': [
            ('Solar-powered habitat', 'Compare solar panel angles for a model space habitat.', [50, None, 50, 50, None, 50, 75, 50]),
        ],
        'notes': 'Measured output at three panel angles and explained which position produced the highest reading.',
        'plan': 'Repeat the measurements with controlled lighting and graph the results.',
        'breakthrough': 'Recognized that panel angle affected the measured output.',
        'support': 'Keep the light source at a fixed distance for a fair comparison.',
        'sdgs': [4, 7],
    },
]


def main():
    global BASE_URL
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000, help='Local portal server port (default: 8000)')
    args = parser.parse_args()
    BASE_URL = f'http://127.0.0.1:{args.port}/api/v1'
    if api('/config')['authentication_required']:
        raise SystemExit('Demo seeding is only available in local mode without access keys.')
    roster = {student['id']: student for student in api('/students')}
    for demo in DEMO_STUDENTS:
        student = {key: demo[key] for key in ('id', 'name', 'age', 'world_tier', 'target_sessions')}
        sid = str(student['id'])
        if sid in roster:
            if roster[sid] != student:
                raise SystemExit(f'{sid} already belongs to a different record; no changes made to it.')
        else:
            api('/students', student)
        saved = {log['id'] for log in api(f'/students/{sid}/logs')['logs']}
        projects = list(demo['projects'])
        notes = str(demo['notes'])
        plan = str(demo['plan'])
        breakthrough = str(demo['breakthrough'])
        support = str(demo['support'])
        hours = float(demo['hours'])
        zone = str(demo['zone'])
        sdgs = list(demo['sdgs'])
        for index, (title, activity, scores) in enumerate(projects):
            session_id = str(uuid5(NAMESPACE_URL, f'edutainal-demo-v1/{sid}/{index}'))
            if session_id in saved:
                continue
            api('/sessions', {
                'id': session_id,
                'student_id': sid,
                'observed_on': (date.today() - timedelta(days=(len(projects) - index) * 7)).isoformat(),
                'zone_name': zone,
                'project_title': f'[Sample] {title}',
                'signature_experience': activity,
                'steamre_rubric': scores,
                'mentor_notes': f'Fictional demonstration data. {notes}',
                'action_plan': plan,
                'breakthrough_note': breakthrough,
                'friction_note': support,
                'session_hours': hours,
                'behavioral_scores': {'curiosity': 3, 'autonomy': 2 if index < 2 else 3, 'collaboration': 3},
                'sdgs': sdgs,
            })
        report = api(f'/students/{sid}/analytics')
        print(f"{student['name']}: {report['total_sessions']} sessions, {report['total_hours']} hours, {len(report['pathways'])} pathways")
    for sid, test_name, scores, maximum, zone, rubric in [
        ('demo-aarav', 'Robotics fundamentals', [10, 15, 18], 20, 'Robotics', [50, 75, None, 75, None, 50, None, None]),
        ('demo-ananya', 'Coding concepts', [6, 8], 10, 'Code Craft', [None, 75, None, 50, 75, 50, None, None]),
    ]:
        saved = {log['id'] for log in api(f'/students/{sid}/logs')['logs']}
        for index, score in enumerate(scores):
            session_id = str(uuid5(NAMESPACE_URL, f'edutainal-demo-test-v1/{sid}/{index}'))
            if session_id in saved:
                continue
            api('/sessions', {
                'id': session_id, 'student_id': sid,
                'observed_on': (date.today() - timedelta(days=(len(scores)-index)*8)).isoformat(),
                'zone_name': zone, 'project_title': f'[Sample] {test_name} assessment {index+1}',
                'signature_experience': 'Complete a practical knowledge check and review the marked answers.',
                'steamre_rubric': rubric,
                'mentor_notes': 'Fictional demonstration data. Completed the practical test and explained the answers during a review with the mentor.',
                'action_plan': 'Revisit the missed questions and explain each correction using a working example.',
                'session_hours': 0.5,
                'test_result': {'name': test_name, 'score': score, 'max_score': maximum},
            })
    print(f'Sample test results ready. Open http://127.0.0.1:{args.port}/?student=demo-aarav')


if __name__ == '__main__':
    main()
