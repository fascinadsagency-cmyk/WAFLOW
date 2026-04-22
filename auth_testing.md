# Auth Testing Playbook (Emergent Google Auth)

Saved from integration_playbook_expert_v2 iter-15.

## Critical rules applied in WAFLOW impl
- `/api/auth/callback` endpoint calls Emergent `/session-data`, stores session_token in httpOnly cookie (7d).
- `/api/auth/me` validates session from cookie OR Authorization: Bearer header.
- All user docs use custom `user_id` (UUID) + `_id:0` projection.
- All session docs use `user_id` matching user.user_id.
- First user logged in → promoted to `admin` role automatically.
- Subsequent logins → email must be in `db.auth_allowlist` (collection) OR be an existing user.
- `invited_by`, `role`, `created_at`, `workspace_id` fields on user doc.

## Test accounts
Real users log in with their Google account. No password-based credentials used.
Test identities & allowlist: see /app/memory/test_credentials.md after first login.
