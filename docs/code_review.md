# Code Review

Date: 2026-09-06
Scope: full repository (backend, frontend, Docker/scripts, docs) at commit
`6713a7d` ("part 10 done and tested & README.md created").
Method: manual read-through of every source file in `backend/src`,
`backend/tests`, `frontend/src`, `frontend/tests`, `Dockerfile`, `scripts/`,
and `docs/`, cross-checked against `backend/CLAUDE.md` and
`frontend/CLAUDE.md`. This is a static review — see the "Already verified"
section below for what was separately confirmed by running the app.

## Summary

The codebase is small, consistent, and matches its own documentation closely
(`backend/CLAUDE.md` and `frontend/CLAUDE.md` are accurate, not aspirational).
No critical or high-severity issues were found. All findings below are low
severity or informational — mostly hardening opportunities and small
inconsistencies, appropriate to flag but none of them block using the app as
built for its stated MVP scope (local, single hardcoded user, Docker-only).

Already verified in a prior session (not re-litigated here): backend pytest
(35 passed), frontend vitest (23 passed), a full Docker build, and a live
end-to-end smoke test (login, card CRUD, container restart persistence, and
a real Groq chat call) all passed.

## Findings

### 1. Login credential comparison is not constant-time — FIXED
**File**: `backend/src/backend/main.py:58` (now `backend/src/backend/auth.py`)
Python's `!=` on strings short-circuits on the first differing byte, which is
a timing side channel. `auth.py`'s session-signature check already used
`hmac.compare_digest` correctly — the login check now does too, via a new
`auth.verify_credentials()` helper used by `main.py`'s login route.
**Severity**: Low (local single-user app; the "secret" is a hardcoded,
publicly-known-by-design credential, so there's nothing to actually leak).
**Status**: Fixed — `uv run pytest` still 35/35 passing.

### 2. Session cookie has no `Secure` flag or expiry
**File**: `backend/src/backend/main.py:61-66`
The cookie is `httponly` + `samesite=lax` but not `secure`, and has no
`max_age`/`expires` (it lasts until the signing key rotates, i.e. until the
process restarts).
**Severity**: Low — correct for local plain-HTTP use today. Only matters if
this is ever served over HTTPS or kept running for long periods.
**Action**: No change needed now. If this app is ever deployed behind HTTPS,
add `secure=True`; if long-lived sessions become undesirable, add a
`max_age`.

### 3. Inconsistent empty-string handling between `title` and `details` in AI-applied card updates — FIXED
**File**: `backend/src/backend/chat.py` (`apply_action`, `update_card` branch)
`action.title or None` silently treated an AI-provided empty string as "leave
the title unchanged," while `details=action.details` treated an AI-provided
empty string as "clear the details field." The two sibling fields had
different semantics for the same input shape. This never caused an
observable defect (`UpdateCardRequest.title` requires `min_length=1`, so an
empty title could never be validly applied anyway), but the asymmetry was
easy to trip over if `chat.py` is extended later.
**Severity**: Low / informational.
**Status**: Fixed — reworded to `action.title if action.title else None`
plus a comment explaining why `title` and `details` are handled differently
(one has a minimum length, the other doesn't). `uv run pytest` still 35/35
passing.

### 4. Redundant PATCH call when a drag-and-drop drop doesn't actually move anything — FIXED
**File**: `frontend/src/components/KanbanBoard.tsx` (`handleDragEnd`)
`handleDragEnd` only skipped work when `active.id === over.id`. If `moveCard`
(`lib/kanban.ts`) can't resolve `activeId`/`overId` to columns for some
reason, it returns the `columns` array unchanged — but `handleDragEnd` still
found the (unchanged) target column and fired `updateCardApi` with the same
`column_id`/`index` the card already had. This was a harmless no-op request,
not a data-integrity bug, but an avoidable network call.
**Severity**: Low.
**Status**: Fixed — `handleDragEnd` now checks `nextColumns === board.columns`
(the reference `moveCard` returns unchanged when nothing moved) and returns
early, skipping both the state update and the API call. Verified with
`npm run test:unit` (23/23 passing) and Playwright's `kanban.spec.ts`
"moves a card between columns" (real browser, real backend).

### 5. Edit form can go stale if the card changes underneath it — FIXED
**File**: `frontend/src/components/KanbanCard.tsx`
The edit form's local `title`/`details` state was seeded from `card` only
when `startEditing()` ran (i.e. when the user clicks "Edit"). If the
underlying card were changed by another source — the AI chat sidebar editing
the same card, or another browser tab — while the edit form was already
open, the open form kept showing the old values, and clicking "Save" would
overwrite the newer server-side value with the stale local one.
**Severity**: Low — requires the same card to be edited from two places
within the same short window; unlikely for the MVP's single-user,
single-tab-at-a-time typical usage, but possible now that AI chat can edit
cards concurrently with the user.
**Status**: Fixed — added a `useEffect` keyed on `card.title`/`card.details`
that exits edit mode if the card changes externally while `isEditing` is
true (the card's own save flow already sets `isEditing` to `false`
synchronously before the update round-trips, so it never fights with a
normal save). Verified with `npm run test:unit` (23/23 passing) and
Playwright's `kanban.spec.ts` edit/cancel-edit specs (real browser, real
backend).

## Informational notes (no action required for MVP scope)

- **No rate limiting on `/api/auth/login`**: fine given the threat model
  (local Docker container, hardcoded credentials meant to be known). Would
  need addressing before any exposure beyond localhost.
- **No `.env.example`**: the README tells users to create a `.env` with
  `GROQ_API_KEY=...`, which works, but a committed `.env.example` template
  is a small onboarding nicety.
- **Dockerfile runs as root, no `HEALTHCHECK`**: acceptable for a local
  single-container MVP; would be worth adding a non-root user and a
  healthcheck if this is ever run somewhere less trusted or orchestrated.
- **`KanbanCard`, `KanbanColumn`, and `NewCardForm` have no dedicated unit
  tests** — they're exercised indirectly via `KanbanBoard.test.tsx` (mocked
  API) and the Playwright e2e specs (real backend), so behavior is covered,
  just not at the smallest unit granularity. Not a gap that's currently
  causing missed bugs, based on the passing suites.
- **Session secret regenerates on every backend restart** (already known —
  see `backend/src/backend/auth.py:13` and `backend/CLAUDE.md`'s Auth
  section): restarting logs everyone out but never loses board data. This
  was already reviewed and confirmed acceptable; no action needed.

## What's solid (worth calling out, not just flagging problems)

- **Per-user data isolation** is enforced at the query level in every
  `board.py` function (always scoped by `user_id`) and explicitly tested
  (`test_second_user_cannot_see_or_modify_first_users_board`), even though
  the MVP only exposes one user today.
- **AI structured-output handling is defensive in the right places**:
  `parse_model_output` never raises on malformed JSON or a schema violation,
  and `apply_action` errors (missing fields, nonexistent column/card ids)
  are caught without corrupting the board or failing the chat request —
  covered by tests for each failure mode plus one live-model test.
- **SQLite concurrency handling** (single shared connection, `threading.Lock`
  around lazy init, `PRAGMA busy_timeout`) is a documented fix for a real,
  previously-reproduced "database is locked" failure under Playwright's
  parallel workers, not speculative hardening.
- **Session tampering is tested** (`test_tampered_session_cookie_is_rejected`)
  and the HMAC verification uses `hmac.compare_digest` correctly.
- **The e2e suite exercises the real stack**, not mocks: real backend, real
  static export, real SQLite file, and (in `chat.spec.ts`) real Groq API
  calls — this catches integration issues unit tests with mocked APIs
  cannot.
- Documentation (`backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/PLAN.md`,
  `docs/database.md`) is detailed and, on inspection, accurate to the actual
  code — a real asset for onboarding or resuming this project later.

## Suggested action list

1. ~~Use `hmac.compare_digest` for the login credential check~~ — **done**,
   via `auth.verify_credentials()`.
2. ~~Normalize the `title`/`details` empty-string asymmetry in `chat.py`'s
   `apply_action`~~ — **done**.
3. ~~Skip the redundant `updateCardApi` call in `KanbanBoard`'s
   `handleDragEnd` when nothing actually moved~~ — **done**.
4. ~~Guard against the AI-editing-while-user-editing race in
   `KanbanCard`~~ — **done**.
5. No action items from the informational notes — recorded for awareness
   only, revisit if the app's deployment scope ever changes.

All four fix items from this review are now applied and verified (backend
`pytest` 35/35, frontend `vitest` 23/23, and the relevant Playwright e2e
specs all passing against the real backend).
