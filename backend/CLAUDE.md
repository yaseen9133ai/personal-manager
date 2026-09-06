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
    ai.py          # Groq client setup (see AI section below)
    chat.py        # POST /api/chat: structured-output schema, prompt, action application
    static/         # in the repo: placeholder hello-world page, used for
                     # local `uv run uvicorn` dev. In the Docker image, the
                     # root Dockerfile's frontend-builder stage overwrites
                     # this directory with the real `frontend/out` static
                     # export at build time (see Dockerfile).
  tests/
    conftest.py     # `client` fixture: fresh temp SQLite DB + logged-in TestClient per test
    test_auth.py    # pytest + FastAPI TestClient
    test_board.py   # board/column/card routes, incl. cross-user isolation
    test_ai.py      # live Groq connectivity check, skipped if GROQ_API_KEY unset
    test_chat.py    # chat action application (mocked model) + one live test
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
- `POST /api/chat` -> body `{"message", "history"?}` (`history` is
  `[{"role": "user"|"assistant", "content": "..."}]`, caller-supplied — see
  AI section); returns `{"reply", "board"}` where `board` is the full,
  current (possibly just-updated) board. Never errors on a bad/unhelpful
  model response — see AI section for the fallback behavior.
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

## AI (Groq)

- `ai.get_client()` returns a lazily-created `groq.Groq()` client. The
  official `groq` SDK auto-reads `GROQ_API_KEY` from the environment
  (`Groq.__init__` falls back to `os.environ["GROQ_API_KEY"]` when no
  `api_key` is passed) — no manual env plumbing needed.
- `ai.py` calls `load_dotenv()` (from `python-dotenv`) pointed at the
  repo-root `.env` on import, with `override=False`. This is purely a local
  dev convenience for `uv run uvicorn` outside Docker — inside the container
  `GROQ_API_KEY` is already set via `docker run --env-file .env`
  (`scripts/start.*`), the repo-root `.env` file doesn't even exist in the
  image (excluded in `.dockerignore`), and `load_dotenv()` on a missing path
  is a harmless no-op either way.
- `MODEL = "openai/gpt-oss-120b"` (root `CLAUDE.md`'s technical decision).
- **Structured outputs are confirmed working** for this model on Groq:
  `response_format={"type": "json_schema", "json_schema": {"name": ...,
  "schema": ..., "strict": True}}` correctly enforces the schema, including
  a nullable field via `"anyOf": [{"type": "null"}, {...}]` (the exact shape
  Part 9 needs for an optional `board_update`). This was verified with real
  API calls, not just docs — Groq's official docs claim support, but there
  are open community-forum reports of `response_format` being ignored on
  this model, so it was worth checking directly. Streaming and tool use are
  not supported together with structured outputs (per Groq's docs) — not a
  concern here since Part 9 doesn't need streaming.
- `tests/test_ai.py` has a live connectivity test (real API call, "what is
  2+2") skipped via `pytest.mark.skipif` when `GROQ_API_KEY` is unset, so the
  suite still runs green in environments without the key.

## AI chat (`chat.py`)

- **Response shape**: `{reply: string, board_update: <action> | null}`. Only
  ONE action per chat turn is supported (not a list) — the plan's own wording
  described `board_update` as singular, and a single flat action shape keeps
  the JSON schema Groq's strict mode enforces as simple as possible, which
  matters given Part 8 found real model-specific structured-output quirks.
  Multi-step requests need multiple chat turns for now; revisit if that
  proves too limiting in practice.
- **Action shape**: one flat object with `type` (enum of the 4 kinds below)
  plus every possible field (`column_id`, `card_id`, `title`, `details`,
  `target_column_id`), each nullable — required by strict mode (every key
  must appear in `required`, even when the value can be `null`). Each action
  type maps 1:1 onto an existing Part 6 `board.py` function:
  - `rename_column`: `column_id` + `title`.
  - `create_card`: `column_id` + `title` (+ optional `details`).
  - `update_card`: `card_id` + any of `title`/`details`/`target_column_id`
    (whichever are non-null are changed; matches `UpdateCardRequest`'s
    existing "omitted = unchanged" semantics from Part 6).
  - `delete_card`: `card_id`.
- **Prompt**: `SYSTEM_PROMPT` plus a second system message containing the
  current board as JSON (`build_messages` in `chat.py`) — sent fresh on
  every request, not cached, so the model always sees current state,
  including whatever the user just did in the UI.
- **Conversation history**: caller-supplied (`ChatRequest.history`), not
  stored server-side — no `chat_messages` table was added, per the plan's
  "note this as a limitation rather than adding a table unless needed."
  Part 10's frontend sidebar owns history in its own component state; it's
  lost on page reload. Revisit with a real table only if that turns out to
  matter in practice.
- **Malformed-response handling**: `parse_model_output` is a pure function
  (no network call) that turns the model's raw content string into a
  `ChatModelOutput`, falling back to `{reply: <raw content or generic
  message>, board_update: None}` on any JSON or schema error — tested
  directly with plain strings, no mocking needed. `handle_chat` additionally
  wraps *applying* an action in `try/except (LookupError, ValueError,
  ValidationError)`: an action referencing a nonexistent column/card, or
  missing a field a given action type actually needs (checked explicitly in
  `apply_action`, since calling `board.py`'s functions directly bypasses
  FastAPI's request-body validation), is silently skipped rather than
  corrupting the board or failing the whole chat request — the user still
  gets the model's reply text either way.
- Every real (non-mocked) manual test of this — rename via natural language,
  create-with-details, move-to-another-column, and an off-topic question
  that correctly left `board_update: null` — worked correctly against the
  live model, including through the actual Docker container.

## Conventions

- All API routes are prefixed `/api/...` so they never collide with the
  static file mount at `/`.
- Routes are registered on `app` before the `StaticFiles` mount, since
  Starlette matches routes in the order they were added.
- `STATIC_DIR` env var overrides where static files are served from
  (defaults to `src/backend/static`). Used by the frontend's Playwright e2e
  setup to point at a real `frontend/out` build without touching the
  committed placeholder — see `frontend/scripts/e2e-server.mjs`.
