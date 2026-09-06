# Database

Schema definitions live in [`db-schema.json`](./db-schema.json) (table/column/
key definitions). This document explains the reasoning; Part 6 implements it.

## Why SQLite + plain `sqlite3`

Decided in `docs/PLAN.md`. SQLite needs no separate server process, fits a
single-container local MVP, and Python's stdlib `sqlite3` module covers
everything this schema needs (three small tables, no complex queries) without
adding an ORM dependency — consistent with the project's "keep it simple, no
over-engineering" standard.

## File location

The DB file lives at `/app/data/app.db` inside the container. This directory
is bind-mounted from a `./data/` folder at the repo root (created on first
run, gitignored) so that `scripts/stop.*` (which removes the container) and
`scripts/start.*` (which recreates it) don't wipe the board — Part 6/7 wires
this mount into the run command. Without this, every stop/start cycle would
silently reset all data, which would fail Part 7's persistence requirement.

## Schema overview

Three tables:

- **`users`** — one row per user. The MVP's actual login check is hardcoded
  in backend code (see `backend/src/backend/auth.py`), not looked up here;
  this table exists so the rest of the schema can scope data by user from
  day one, per the root `CLAUDE.md`'s "database will support multiple users
  for future" requirement. Exactly one row (`username = 'user'`) is seeded
  for the MVP.
- **`board_columns`** — the 5 fixed columns, one full set per user. `slug`
  (`col-backlog`, `col-discovery`, `col-progress`, `col-review`, `col-done`)
  is the fixed, non-editable identity; `title` is what the user can rename;
  `position` fixes display order. Primary key is `(user_id, slug)`.
- **`cards`** — belongs to a user and a column (`column_slug`). `id` is a
  server-generated opaque string (`card-<uuid4>`), matching the id style the
  frontend demo already uses (`card-1`, `card-2`, ...). `position` orders
  cards within their column.

Relationships: `board_columns.user_id` and `cards.user_id` both reference
`users.id` (`ON DELETE CASCADE`). `cards` also has a composite foreign key on
`(user_id, column_slug)` referencing `board_columns(user_id, slug)` — this
guarantees a card can never point at another user's column, not just an
arbitrary column row.

## Mapping to the frontend's `BoardData` shape

The frontend (`frontend/src/lib/kanban.ts`) expects:

```ts
type BoardData = { columns: Column[]; cards: Record<string, Card> };
type Column = { id: string; title: string; cardIds: string[] };
type Card = { id: string; title: string; details: string };
```

The backend assembles this per request from two queries scoped to the
session's `user_id`:

- `Column.id` <- `board_columns.slug`, `Column.title` <- `board_columns.title`,
  ordered by `position`.
- `Column.cardIds` <- `cards.id` for that column, ordered by `cards.position`.
- `cards` record <- `{id, title, details}` for every card row for that user.

No stored JSON blob — the relational shape is simple enough that assembling
the frontend's JSON shape from normalized rows on each request is
straightforward and keeps single-card edits/moves as plain, targeted SQL
statements instead of read-modify-write on a blob.

## Fixed columns: seeded rows, not an enum

The 5 columns are represented as actual seeded rows per user (not just a
hardcoded list in code) so that renaming a column is a normal `UPDATE
board_columns SET title = ? WHERE user_id = ? AND slug = ?` — no special
casing needed elsewhere. The `slug` and `position` columns are never exposed
for editing by the API; only `title` is mutable, which is enough to implement
the "columns can be renamed" requirement while keeping the set of columns
fixed.

## Init-on-first-run strategy

No migration framework (e.g. Alembic) — the schema is small and the "keep it
simple" standard argues against the extra dependency at this scale. Instead,
on backend startup:

1. Ensure `/app/data/` exists.
2. Open the SQLite connection; run `PRAGMA foreign_keys = ON` and
   `PRAGMA journal_mode = WAL`.
3. Run `CREATE TABLE IF NOT EXISTS` for all three tables — idempotent, safe
   to run on every startup, and creates the file itself if it doesn't exist.
4. `INSERT OR IGNORE` the single hardcoded user (`username = 'user'`).
5. `INSERT OR IGNORE` that user's 5 `board_columns` rows (see `seed_data` in
   `db-schema.json`).
6. No cards are seeded — a real (persisted) board starts empty. The 8 sample
   cards currently in `frontend/src/lib/kanban.ts` were only ever a
   frontend-only demo fixture and won't carry over once the backend is wired
   up in Part 7.

If the schema needs to change later, extend step 3 with additive `ALTER
TABLE` statements guarded by a `PRAGMA user_version` check — still no
migration framework needed at this scale, revisit only if that stops being
true.

## Concurrency

A single backend process talking to one local SQLite file is enough for this
MVP (one user, run locally). `PRAGMA journal_mode = WAL` is enabled anyway
since it's free and avoids "database is locked" errors if a request and, for
example, the Part 9 AI chat handler ever touch the DB at overlapping moments.
