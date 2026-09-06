# Backend

FastAPI app, managed with `uv`. Package lives at `src/backend/`.

## Structure

```
backend/
  pyproject.toml   # uv-managed project, deps: fastapi, uvicorn[standard]
  uv.lock
  src/backend/
    __init__.py
    main.py        # FastAPI app: /api/health, /api/auth/*, mounts static/ at "/"
    auth.py        # session cookie signing/verification, hardcoded credentials
    static/         # in the repo: placeholder hello-world page, used for
                     # local `uv run uvicorn` dev. In the Docker image, the
                     # root Dockerfile's frontend-builder stage overwrites
                     # this directory with the real `frontend/out` static
                     # export at build time (see Dockerfile).
  tests/
    test_auth.py    # pytest + FastAPI TestClient
```

## Running locally

```bash
uv sync
uv run uvicorn backend.main:app --app-dir src --reload --port 8000
```

## Testing

```bash
uv run pytest
```

## Routes

- `GET /api/health` -> `{"status": "ok"}`
- `POST /api/auth/login` -> body `{"username", "password"}`; on match sets an
  HTTP-only `session` cookie and returns `{"username"}`; 401 otherwise.
- `POST /api/auth/logout` -> clears the `session` cookie.
- `GET /api/auth/me` -> `{"username"}` for a valid session, else 401.
- `GET /` (and any other path not starting with `/api`) -> served from
  `src/backend/static/` via `StaticFiles(html=True)`.

## Auth

- Credentials are hardcoded (`user` / `password`) per the MVP scope in the
  root `CLAUDE.md` — no signup, no per-user storage yet.
- Sessions are a signed cookie (HMAC-SHA256 over the username, stdlib `hmac`/
  `hashlib`, no extra dependency), not server-side session storage. The
  signing secret (`backend/src/backend/auth.py`) is generated fresh on
  process start, so restarting the backend invalidates all sessions — an
  acceptable MVP limitation given there's only one user.
- `get_current_user` (a FastAPI dependency in `main.py`) reads and verifies
  the `session` cookie; routes needing auth take it as a dependency.

## Conventions

- All API routes are prefixed `/api/...` so they never collide with the
  static file mount at `/`.
- Routes are registered on `app` before the `StaticFiles` mount, since
  Starlette matches routes in the order they were added.
- `STATIC_DIR` env var overrides where static files are served from
  (defaults to `src/backend/static`). Used by the frontend's Playwright e2e
  setup to point at a real `frontend/out` build without touching the
  committed placeholder — see `frontend/scripts/e2e-server.mjs`.
- No ORM — plain stdlib `sqlite3` will be used once the database is added
  (Part 5/6 of `docs/PLAN.md`), per the project's "keep it simple" standard.
