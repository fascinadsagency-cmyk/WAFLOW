# WAFLOW — PRD

## Original problem statement
Full-stack WhatsApp Flow Editor (WAFLOW). MVP with Meta WhatsApp API, Evolution API.
Custom Email/Password authentication (after Emergent Google Auth infra 403).
External PostgreSQL read-only for master config. Multi-tenant isolation.
Strict text formatting for Meta templates (no emojis, variables checked).

## Architecture
- /app/backend → FastAPI (server.py + db_setup.py + auth_deps.py + pg_client.py + pg_routes.py)
- /app/frontend → React (App.jsx + pages/LoginWall.jsx + hooks/useAuth.jsx + components/)
- MongoDB (projects, wa_users, user_sessions, auth_allowlist) + PostgreSQL (read-only)
- Auth: bcrypt Email/Password (primary), Emergent Google (secondary fallback)

## Completed (Feb 2026)
- Custom Email/Password auth (bcrypt) — primary login
- Direct Meta Template sync (/api/meta/templates/sync)
- Bot Prompts Catalog (8-phase prompts)
- PostgreSQL read-only integration (pg_client.py + pg_routes.py)
- Backend modularization (db_setup, auth_deps, pg_routes)
- MessageCard.jsx extraction (~900 lines from App.jsx)
- Login bulletproof fix: response.clone() + double-submit guard + cache no-store

## Backlog (priority)
- P1: User Profile dropdown menu (change password / logout / profile)
- P1: E2E Meta API testing with real WABA credentials
- P2: Media hosting external (S3/fal.ai) instead of GridFS
- P2: Multi-tenant workspace switcher UI
- P2: Rate limiting (slowapi) on public endpoints
- P3: App.jsx further extraction (AutopilotPanel, LaunchWizard, ConnectionsPanel)

## Known
- Production deploys lag preview — user must click "Deploy" to push changes
- Legacy tests archived in /app/backend/tests/_legacy/
