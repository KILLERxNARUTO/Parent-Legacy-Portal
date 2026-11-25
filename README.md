# Edutainal Student Progress Portal

An evidence-based learning portal with two synchronized authenticated environments:

- **Parent Portal** (`/parent`) &mdash; Email & Password authentication for parents to track their child's learning journey, STEAMRE rubric progress, and certificates.
- **Company Workspace** (`/company`) &mdash; Login ID & Password authentication for mentors and evaluators to record rubric evidence and manage student assignments.

---

## Quick Start (Development)

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Start the server
python -m uvicorn backend.main:app --reload
```

Open `http://127.0.0.1:8000` in your browser.

> In development mode (default), sample student data and demo accounts are automatically prepared so you can explore immediately:
> - **Company Workspace**: Login ID `company.admin` / Password `DemoPassword123!`
> - **Parent Portal**: Email `parent.aarav@gmail.com` (or `parent.aarav`) / Password `DemoPassword123!`

---

## Authentication System

Both portals now use **Email / Login ID and Password** protected by cryptographic **Scrypt** multi-round hashing and separate session scopes:

1. **Parent Console (`/parent/login`)**:
   - Parents log in using their registered Email or Username and Password.
   - Company mentors create and manage parent accounts directly inside the Company Workspace under **Parent accounts & child access** or via the CLI.
   - Parents can only see data for the specific children linked to their account.

2. **Company Workspace (`/company/login`)**:
   - Company evaluators and administrators log in with their assigned Login ID and Password.
   - Accounts are created via the local CLI:
     ```bash
     python -m backend.accounts create-company
     ```

3. **Simultaneous Dual Sessions**:
   - The portals use separate session cookies (`edutainal_parent_session` and `edutainal_company_session`).
   - You can open both portals side-by-side in separate tabs or windows without session conflicts.
   - Signing out of one portal leaves the other portal signed in. A missing or expired session returns to that portal's own login.
   - API requests identify their portal with `X-Portal: parent` or `X-Portal: company`. A scoped request never falls back to the other portal's session.
   - Live updates use `/api/v1/events?portal=parent` or `?portal=company`, require a matching session, and recheck current child assignments before sending events.

The parent console loads `dashboard.js` for assigned-child learning reports. The company workspace loads `company-dashboard.js` for saved student records, alongside staff-only enrollment, assessment and parent-access management. The two views share saved observations; company controls and account data are not rendered in the parent console.

---

## Security Features

- **Scrypt Password Hashing**: Passwords stored as `scrypt$salt$digest` with `n=32768, r=8, p=1`.
- **Brute-Force Protection**: 5 failed login attempts per username/IP triggers a 15-minute lockout.
- **CSRF Defense**: All state-changing requests require an atomic `X-CSRF-Token` header.
- **Clickjacking Protection**: `Content-Security-Policy` with `frame-ancestors 'none'`.
- **No Sniffing & Same-Origin**: `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`.

---

## Running Tests

```bash
# Python test suite (20 tests)
python -m unittest discover -s tests -v

# JavaScript analytics tests (6 tests)
node --test tests/test_analytics.cjs
node --test tests/test_portal_views.cjs
```
