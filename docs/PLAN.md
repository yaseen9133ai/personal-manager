# High level steps for project

This document enriches the original 10-part outline into a checklist with
substeps, tests, and success criteria per part, per Part 1's instructions.
Parts are executed in order; each part ends with the user reviewing and
approving before the next part starts.

## Decisions made while enriching this plan

These fill gaps the original outline left open. Flagged here so they can be
corrected before Part 2 (scaffolding) begins — everything below is otherwise
assumed approved.

- **Fixed columns**: keep the 5 columns already in the frontend demo —
  Backlog, Discovery, In Progress, Review, Done (ids `col-backlog`,
  `col-discovery`, `col-progress`, `col-review`, `col-done`). Users can rename
  them but the set of 5 is fixed (no add/remove column).
- **Static serving**: the frontend is built with Next.js static export
  (`output: "export"` in `next.config.ts`) and the resulting HTML/JS/CSS is
  served by FastAPI (via `StaticFiles`) at `/`. The frontend talks to the
  backend only via `fetch` calls to `/api/*` — no Next server features
  (route handlers, server actions, SSR data fetching) are used, since none
  are needed today.
- **Auth**: hardcoded credentials (`user` / `password`). On successful login,
  the backend sets an HTTP-only signed session cookie; a `session` table (or
  signed cookie value) identifies the user on subsequent requests. No signup,
  no password hashing needed for the MVP credential itself, but the session
  token is opaque/signed, not the raw password.
- **Database access**: plain Python `sqlite3` (stdlib), no ORM — matches the
  "keep it simple, no over-engineering" standard and avoids adding a
  dependency the project doesn't need at this scale.
- **AI structured outputs**: use Groq's OpenAI-compatible `response_format`
  (JSON schema mode) with `openai/gpt-oss-120b`. This needs a connectivity
  spike in Part 8 to confirm the exact structured-output mechanism this model
  supports on Groq before Part 9 depends on it — flagged as a risk below.
- **Docker**: single multi-stage Dockerfile — a Node stage builds the static
  frontend export, a Python (`uv`) stage installs backend deps and copies the
  static export in; the final image runs `uvicorn` serving FastAPI, which
  mounts the static files and owns the SQLite file under a mounted/local data
  directory. Container exposes one port (8000).

## Risks / things to verify early

- Confirm Groq's `openai/gpt-oss-120b` supports structured JSON outputs
  (JSON schema `response_format` or tool-calling) — verify in Part 8 before
  Part 9's schema design depends on it.
- `.env` at repo root holds `GROQ_API_KEY` — already gitignored; the Docker
  setup must load it (e.g. `--env-file .env` in the start script) rather than
  baking it into the image.

---

## Part 1: Plan

- [x] Review existing frontend code and business requirements.
- [x] Write `frontend/CLAUDE.md` describing the existing frontend code.
- [x] Enrich this document with substeps, tests, and success criteria per part.
- [ ] User reviews and approves this plan (and the decisions above) before
      Part 2 starts.

**Success criteria**: user has confirmed this document and `frontend/CLAUDE.md`
are accurate and the decisions above are acceptable (or given corrections).

---

## Part 2: Scaffolding

- [x] Create `backend/` FastAPI app (`uv` project: `pyproject.toml`, `uv.lock`).
- [x] Add a minimal route: `GET /api/health` returning `{"status": "ok"}`.
- [x] Serve a static "hello world" HTML page at `/` (placeholder, ahead of the
      real Next.js static export landing in Part 3).
- [x] Write the Dockerfile at the repo root (single Python/uv stage for now;
      the Node build stage is added in Part 3).
- [x] Write `scripts/start.sh`, `scripts/stop.sh` (Mac/Linux) and
      `scripts/start.ps1`, `scripts/stop.ps1` (Windows) that build the Docker
      image, run the container with `.env` loaded and a port published, and
      stop/remove it respectively.
- [x] Update `backend/CLAUDE.md` with a real description of the backend.

**Tests / how to verify**:
- `docker build` succeeds.
- Running `scripts/start.*` then `curl http://localhost:8000/` returns the
  hello-world HTML, and `curl http://localhost:8000/api/health` returns
  `{"status": "ok"}`.
- `scripts/stop.*` cleanly stops and removes the container.

**Success criteria**: a fresh clone, with only Docker installed and `.env`
present, can run the start script and reach both the static hello-world page
and the health-check API locally.

---

## Part 3: Add in Frontend

- [x] Set `output: "export"` in `frontend/next.config.ts`; confirm
      `next build` produces a static `out/` directory that renders the Kanban
      demo correctly with no server-only features in use.
- [x] Update the Dockerfile to add a Node build stage that runs
      `npm ci && npm run build` in `frontend/` and copies `frontend/out` into
      the backend image.
- [x] Update FastAPI to mount the static export directory at `/` (no SPA
      fallback needed yet — the app is a single route today; revisit if
      client-side routes are added later).
- [x] Keep the frontend's existing Vitest unit tests and Playwright e2e tests
      passing against the exported build.

**Tests**:
- `npm run test:unit` and `npm run test:e2e` pass in `frontend/` (dev mode,
  as today).
- New: an e2e or manual check hitting the Dockerized app confirms the Kanban
  board (5 columns, drag/drop, add/delete card, rename column) renders and
  works identically to `next dev`, served from the container.

**Success criteria**: `scripts/start.*` followed by visiting `/` in a browser
shows the same working Kanban demo as `next dev` today, fully served by the
Dockerized FastAPI backend with no separate Node process running.

---

## Part 4: Add in a fake user sign in experience

- [x] Add `POST /api/auth/login` (checks hardcoded `user`/`password`, sets
      HTTP-only session cookie) and `POST /api/auth/logout` (clears it) and
      `GET /api/auth/me` (returns current session user or 401).
- [x] Add a login page/view in the frontend (static export) shown when there
      is no valid session; redirect to the board once logged in.
- [x] Add a logout control in the board UI.
- [x] Guard the board: unauthenticated users seeing `/` are shown the login
      form, not the Kanban board.

**Tests**:
- Backend: unit tests for `/api/auth/login` (correct creds succeed and set
  cookie; wrong creds return 401), `/api/auth/logout`, and `/api/auth/me`
  (with/without valid session cookie).
- Frontend: unit tests for the login form (validation, error on bad creds)
  and for the logged-out/logged-in view switch; e2e test covering
  login -> see board -> logout -> see login form again.

**Success criteria**: visiting `/` with no session shows only the login form;
logging in with `user`/`password` shows the board; logging out returns to the
login form; wrong credentials show an error and do not grant access.

---

## Part 5: Database modeling

- [x] Design a SQLite schema for users, the (single, per-user) board, columns,
      and cards. Save the schema as JSON in `docs/` (e.g.
      `docs/db-schema.json`), including table names, columns, types, keys,
      and relationships.
- [x] Write `docs/database.md` documenting the approach: why SQLite + plain
      `sqlite3`, how the schema maps to the frontend's `BoardData` shape, how
      the 5 fixed columns are represented (seeded rows vs. enum), migration/
      init-on-first-run strategy.
- [x] User reviews and signs off on the schema before Part 6 implements it.

**Tests**: N/A (design artifact) — reviewed by inspection.

**Success criteria**: user approves `docs/db-schema.json` and
`docs/database.md` before any backend/DB code is written.

---

## Part 6: Backend

- [x] Implement DB init: create the SQLite file and tables on first run if
      missing, seed the fixed columns and a default user.
- [x] Add API routes (all requiring a valid session):
      `GET /api/board` (full board for the current user),
      `PATCH /api/columns/{id}` (rename),
      `POST /api/cards`, `PATCH /api/cards/{id}` (edit/move), `DELETE /api/cards/{id}`.
- [x] Enforce per-user data isolation at the query level (every query scoped
      to the session's user id), even though MVP only exposes one user.

**Tests**:
- Backend unit tests (e.g. `pytest`) for each route: happy path, validation
  errors, unauthenticated access rejected, DB created fresh if absent, and
  moving/reordering cards persists correctly.
- Test that a second user (created directly in the DB for the test) cannot
  see or modify the first user's board.

**Success criteria**: all backend routes pass their unit tests against a
throwaway SQLite DB, and manual `curl`/Postman checks confirm the API matches
`docs/db-schema.json`.

---

## Part 7: Frontend + Backend

- [x] Replace the frontend's local `useState(initialData)` with data fetched
      from `GET /api/board` on load, with a loading state.
- [x] Wire rename, add card, delete card, and move card actions to call the
      corresponding backend routes, updating local state from the response
      (or via optimistic update + reconciliation).
- [x] Handle API errors in the UI (e.g. session expired -> redirect to login).

**Tests**:
- Frontend unit tests updated/added to mock the API and verify each action
  calls the right endpoint with the right payload and updates the UI from the
  response.
- Full e2e test (Playwright, against the real Dockerized backend + a test
  DB): login, add a card, move it, rename a column, refresh the page, and
  confirm all changes persisted.

**Success criteria**: refreshing the browser (or restarting the container)
preserves all board changes — the app is a genuinely persistent Kanban board,
not an in-memory demo.

---

## Part 8: AI connectivity

- [ ] Add Groq client setup in the backend, reading `GROQ_API_KEY` from the
      environment (via `.env`, loaded into the container).
- [ ] Add a minimal internal check (e.g. a small script or a temporary test)
      that sends a "what is 2+2" prompt to `openai/gpt-oss-120b` via Groq and
      confirms a sane response comes back.
- [ ] Confirm and document what structured-output mechanism this model
      supports on Groq (JSON schema `response_format` vs. tool calling) —
      resolves the open risk noted above, before Part 9 designs the schema
      around it.

**Tests**: an automated test (marked to skip gracefully if `GROQ_API_KEY` is
absent, e.g. in CI) that calls Groq with the 2+2 prompt and asserts the
response contains "4".

**Success criteria**: a real, verified call to Groq's `openai/gpt-oss-120b`
succeeds from inside the backend/container, and the structured-output
mechanism to use in Part 9 is confirmed.

---

## Part 9: AI chat with structured Kanban updates

- [ ] Design the structured output schema: `{ reply: string, board_update:
      <optional partial board change> | null }`. Define exactly what shapes
      of update are allowed (rename column, add/edit/move/delete card(s)) —
      keep this to what's achievable in Part 6/7's API rather than a generic
      diff format.
- [ ] Add `POST /api/chat` that: loads the current board JSON, appends the
      user's message and prior conversation history, calls Groq with the
      structured-output schema, applies any returned board update via the
      existing Part 6 persistence logic, and returns the reply + updated
      board.
- [ ] Store or pass conversation history (in-memory per session is acceptable
      for MVP; note this as a limitation rather than adding a chat-history
      table unless needed).

**Tests**:
- Backend unit tests mocking the Groq call: verify a reply-only response
  changes nothing on the board; verify a response with a board update is
  correctly applied and persisted; verify a malformed/out-of-schema response
  is rejected without corrupting the board.
- One live test (same skip-if-no-key pattern as Part 8) asking the AI to
  perform a real, simple board edit (e.g. "add a card called X to Backlog")
  and confirming the DB reflects it.

**Success criteria**: sending a chat message that requests a board change
results in the correct, persisted change and a sensible reply; a message that
doesn't request a change leaves the board untouched.

---

## Part 10: AI chat sidebar UI

- [ ] Build a chat sidebar component (message list + input) matching the
      project's color scheme, added to the board layout.
- [ ] Wire it to `POST /api/chat`; render the AI's reply in the message list.
- [ ] When the response includes a board update, refresh the board view
      automatically (re-fetch or apply the returned updated board) without a
      manual page reload.
- [ ] Handle loading and error states in the chat UI (e.g. Groq call fails).

**Tests**:
- Frontend unit tests for the chat component: sending a message, displaying
  the reply, and triggering a board refresh when a `board_update` is present
  (mocked API).
- E2E test: open the chat sidebar, ask for a board change, confirm the
  message appears, the AI reply appears, and the board visibly updates
  without a manual refresh.

**Success criteria**: a user can chat with the AI in the sidebar and see it
create/edit/move cards on the visible board in real time, matching the
business requirement in the root `CLAUDE.md`.
