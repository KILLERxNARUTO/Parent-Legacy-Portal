"""Local account administration: create-company, setup-demo, migrate-legacy."""
import argparse
import getpass
import json
import secrets
import sqlite3
import uuid
from pathlib import Path
from backend import main, auth


def add_user(username, name, password, role, children=()):
    main.ParentCreate(username=username, name=name, password=password, students=list(children))
    with main.database() as db:
        if db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone():
            return False
        for sid in children:
            main.read_student(db, sid)
        uid = uuid.uuid4().hex
        db.execute('INSERT INTO users (id,username,name,password_hash,role) VALUES (?,?,?,?,?)',
                   (uid, username, name, auth.hash_password(password), role))
        db.executemany('INSERT INTO parent_children VALUES (?,?)', [(uid, sid) for sid in children])
    return True


def migrate_legacy():
    legacy = main.ROOT / 'backend' / 'portal.sqlite3'
    if Path(main.DB_PATH).resolve() == legacy.resolve():
        raise SystemExit('The protected database must use a different path from the legacy database.')
    if not legacy.exists():
        print('No legacy database to migrate.')
        return
    with main.database() as db:
        db.execute('ATTACH DATABASE ? AS legacy', (str(legacy),))
        db.execute('BEGIN IMMEDIATE')
        count = db.execute('SELECT COUNT(*) FROM legacy.students').fetchone()[0]
        observations = db.execute('SELECT COUNT(*) FROM legacy.observations').fetchone()[0]
        if not count and not observations:
            print('Legacy records have already been moved.')
            return
        if db.execute('SELECT COUNT(*) FROM students').fetchone()[0] or db.execute('SELECT COUNT(*) FROM observations').fetchone()[0]:
            raise SystemExit('Protected database already has records; migration stopped without changes.')
        db.execute('INSERT INTO students SELECT * FROM legacy.students')
        db.execute('INSERT INTO observations SELECT * FROM legacy.observations')
        if db.execute('SELECT COUNT(*) FROM students').fetchone()[0] != count or db.execute('SELECT COUNT(*) FROM observations').fetchone()[0] != observations:
            raise RuntimeError('Migration verification failed')
        # One transaction moves all records, so an old unauthenticated process has no access to them.
        db.execute('DELETE FROM legacy.observations')
        db.execute('DELETE FROM legacy.students')
    print(f'Moved {count} students and {observations} observations into the protected database. Legacy tables are empty.')


def main_cli():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['create-company', 'setup-demo', 'migrate-legacy'])
    args = parser.parse_args()
    main.init_db()
    if args.command == 'migrate-legacy':
        migrate_legacy()
    elif args.command == 'create-company':
        username = input('Company username: ').strip().lower()
        name = input('Display name: ').strip()
        password = getpass.getpass('Password (at least 12 characters): ')
        if password != getpass.getpass('Confirm password: '):
            raise SystemExit('Passwords did not match.')
        print('Company account created.' if add_user(username, name, password, 'observer') else 'Username already exists; no changes made.')
    else:
        if main.os.environ.get('PORTAL_MODE') == 'production':
            raise SystemExit('Sample accounts cannot be created in production mode.')
        specs = [('company.admin','Company administrator','observer',[]),
                 ('parent.aarav','Aarav parent','parent',['demo-aarav']),
                 ('parent.ananya','Ananya parent','parent',['demo-ananya']),
                 ('parent.kabir','Kabir parent','parent',['demo-kabir'])]
        with main.database() as db:
            for _, _, _, children in specs:
                for sid in children:
                    if '(Sample)' not in main.read_student(db, sid)['name']:
                        raise SystemExit('Demo accounts can only be assigned to labeled sample students.')
        for username, name, role, children in specs:
            password = secrets.token_urlsafe(15)
            if add_user(username, name, password, role, children):
                print(json.dumps({'username':username,'password':password,'portal':'company' if role=='observer' else 'parent','children':children}))
            else:
                print(json.dumps({'username':username,'status':'already_exists'}))


if __name__ == '__main__':
    main_cli()
