# Backend

FastAPI app, managed with `uv`. Package lives at `src/backend/`.

## Structure

```
backend/
  pyproject.toml   # uv-managed project, deps: fastapi, uvicorn[standard]
  uv.lock
  src/backend/
    __init__.py
    main.py        # FastAPI app: /api/health, /api/auth/*, /api/board, /api/columns/*, /api/cards/*
    auth.py        # session cookie signing/verification, hardcoded credentials
    db.py          # sqlite3 connection, schema creation, seeding (see docs/database.md)
    board.py       # board/column/card business logic + Pydantic request/response models
    static/         # in the repo: placeholder hello-world page, used for
                     # local `uv run uvicorn` dev. In the Docker image, the
                     # root Dockerfile's frontend-builder stage overwrites
                     # this directory with the real `frontend/out` static
                     # export at build time (see Dockerfile).
  tests/
    conftest.py     # `client` fixture: fresh temp SQLite DB + logged-in TestClient per test
    test_auth.py    # pytest + FastAPI TestClient
    test_board.py   # board/column/card routes, incl. cross-user isolation
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
- `GET /api/board` -> the current user's full board (`{columns, cards}`,
  matching the frontend's `BoardData` shape exactly — see `docs/database.md`).
- `PATCH /api/columns/{column_id}` -> body `{"title"}`; renames a column.
  404 if `column_id` isn't one of the user's 5 seeded columns.
- `POST /api/cards` -> body `{"column_id", "title", "details"?}`; creates a
  card at the end of that column. 404 if the column doesn't exist for this
  user. Returns the created card, `201`.
- `PATCH /api/cards/{card_id}` -> body `{"title"?, "details"?, "column_id"?,
  "index"?}`; edits fields given and/or moves the card. `column_id` moves it
  to another (of the user's own) columns; `index` sets its 0-based position
  within its (possibly new) column. Omitting both leaves position unchanged.
  404 if the card or target column don't exist for this user.
- `DELETE /api/cards/{card_id}` -> `204`. 404 if not found for this user.
- `GET /` (and any other path not starting with `/api`) -> served from
  `src/backend/static/` via `StaticFiles(html=True)`.

All board/column/card routes require a valid session (`get_current_user_id`
dependency) and are scoped to that session's `user_id` at the query level —
a 404 is returned for anything belonging to another user, same as if it
didn't exist at all (never a 403, to avoid confirming existence).

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
- Since the signing secret resets on every backend restart, any board API
  call after a restart gets `401` even with an old, previously-valid cookie.
  The frontend's `KanbanBoard` treats a `401` from any board call as "session
  expired" and returns to the login form (`onSessionExpired` prop) rather
  than showing a raw error — see `frontend/CLAUDE.md`'s Auth section.

## Database

- Plain stdlib `sqlite3`, no ORM — see `docs/database.md` and
  `docs/db-schema.json` for the schema and reasoning.
- `db.get_connection()` lazily opens (and, on first call, initializes: creates
  tables + seeds the hardcoded user and their 5 columns) a single
  long-lived connection, guarded by a `threading.Lock` so concurrent
  first-time requests (FastAPI runs sync routes in a thread pool) can't race
  to open+init the same fresh file at once. `PRAGMA busy_timeout` is also set
  so concurrent writes from different threads on that shared connection wait
  for the lock instead of immediately raising "database is locked" — this
  was a real, reproducible failure under Playwright's parallel e2e workers
  before both fixes were added. `db.reset_connection()` is test-only, forcing
  the next `get_connection()` call to reopen against the current `DB_PATH`.
- `DB_PATH` env var overrides the DB file location (default:
  `backend/data/app.db` locally, which resolves to `/app/data/app.db` in the
  Docker image since it's computed relative to the source file, not `cwd`).
  Backend tests set this per-test (via the `client` fixture in
  `tests/conftest.py`) to a fresh temp file for isolation.
- In Docker, `/app/data` is bind-mounted from a host `./data/` directory by
  `scripts/start.*` (created if missing, gitignored) — without this, every
  `scripts/stop.*` (which does `docker rm -f`) would destroy the database.
- `board.py`'s functions take a raw `sqlite3.Connection` and a `user_id` and
  do their own `commit()` — no separate transaction/session layer, matching
  the project's "keep it simple" standard at this scale.

## Conventions

- All API routes are prefixed `/api/...` so they never collide with the
  static file mount at `/`.
- Routes are registered on `app` before the `StaticFiles` mount, since
  Starlette matches routes in the order they were added.
- `STATIC_DIR` env var overrides where static files are served from
  (defaults to `src/backend/static`). Used by the frontend's Playwright e2e
  setup to point at a real `frontend/out` build without touching the
  committed placeholder — see `frontend/scripts/e2e-server.mjs`.
