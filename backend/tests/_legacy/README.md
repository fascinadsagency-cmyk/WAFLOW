# Legacy tests (pre-iter-17)

These tests target endpoints that were public BEFORE iter-17 added the
authentication wall (`Depends(require_user)` on storage / events / launch /
intake / meta / whatsapp endpoints). They:

- Hit endpoints with raw `requests.get/post/put` without the session cookie.
- Expect `200 OK` where now the response is `401 No autenticado`.
- Read `REACT_APP_BACKEND_URL` from the env directly (which is no longer
  guaranteed to exist in the backend pod).

They are kept here for two reasons:

1. **Reference for future migration** — they document the intended request
   flow for each feature. When we add a `requests` fixture that injects a
   valid session cookie, they will be revivable with minimal edits.
2. **Code-coverage map** — they show which features had public e2e tests
   originally.

**Do NOT add new tests here.** New tests live in `tests/` and use the
`TestClient` + auth helpers already in `test_iter10_auth_protection.py` /
`test_pg_integration.py`.

If a code-quality linter complains about complexity / `is True` / etc. inside
this folder, ignore it: the files are frozen pending refactor (P2 backlog).
