# Frontend — Kanban Studio

Built with Next.js App Router, statically exported. The board itself still
holds its data in local `useState` (no persistence yet — Part 7 wires it to
the backend), but the app is now gated behind real login/session calls to the
FastAPI backend (Part 4).

## Stack

- Next.js 16.1.6 (App Router), React 19.2.3
- TypeScript, strict mode
- Tailwind CSS 4 (via `@tailwindcss/postcss`, `@theme inline` in `globals.css`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- `clsx` for conditional classnames
- Vitest + Testing Library for unit/component tests
- Playwright for e2e tests

## Structure

```
src/
  app/
    layout.tsx      # root layout, loads Space Grotesk (display) + Manrope (body) fonts
    page.tsx         # renders <AppShell /> at "/"
    globals.css      # Tailwind import, CSS custom properties (color tokens), base styles
  components/
    AppShell.tsx           # client component: checks session, renders LoginForm or KanbanBoard
    LoginForm.tsx           # username/password form, calls lib/auth login()
    KanbanBoard.tsx        # top-level board; owns board state, DndContext; takes onLogout prop
    KanbanColumn.tsx      # one column: droppable area, rename input, NewCardForm
    KanbanCard.tsx         # one draggable card (sortable), with delete button
    KanbanCardPreview.tsx  # non-interactive card render used in DragOverlay
    NewCardForm.tsx        # inline "add card" form, toggled open/closed
  lib/
    kanban.ts        # types (Card, Column, BoardData), initialData seed, moveCard(), createId()
    auth.ts          # fetchMe(), login(), logout() -- calls /api/auth/*
  test/
    setup.ts, vitest.d.ts
tests/
  helpers.ts         # login(page) helper shared by specs
  kanban.spec.ts     # Playwright e2e specs (board interactions)
  auth.spec.ts       # Playwright e2e specs (login/logout flow)
scripts/
  e2e-server.mjs     # boots the real backend+static export for e2e (see Testing)
```

## Data model (current, in-memory only)

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

- `initialData` in `lib/kanban.ts` seeds 5 fixed columns (Backlog, Discovery, In
  Progress, Review, Done) with 8 sample cards, ids like `col-backlog`, `card-1`.
- `moveCard(columns, activeId, overId)` is pure — handles reordering within a
  column and moving across columns (dropped on a card or on an empty column).
- `createId(prefix)` makes a client-side id from `Math.random` + timestamp
  (`card-<random><time>`), used only for new cards created client-side.

## Auth

- `AppShell` (rendered by `app/page.tsx`) is the gate: on mount it calls
  `GET /api/auth/me`; while that's pending it shows a loading state, then
  renders `<LoginForm>` (no/invalid session) or `<KanbanBoard>` (valid
  session).
- `LoginForm` posts to `/api/auth/login` with `{ username, password }`; on
  success it calls `onSuccess(user)` (bubbles up to `AppShell`); on failure it
  shows the backend's error message in a `data-testid="login-error"` element
  (deliberately not `getByRole("alert")` alone in tests — Next's router
  announcer also has `role="alert"` in a real running app, which makes that
  role ambiguous in e2e tests, though not in isolated component tests).
- `KanbanBoard` takes a required `onLogout` prop (a "Log out" button in its
  header); `AppShell` wires this to `POST /api/auth/logout` then clears its
  user state, which re-renders `LoginForm`.
- Credentials are hardcoded server-side (`user` / `password`); there's no
  signup or per-user data yet (see root `CLAUDE.md`'s MVP limitations).

## State and behavior

- `KanbanBoard` holds all board state in a single `useState<BoardData>`, seeded
  from `initialData`. There is no persistence — a page reload resets to the seed.
- Column rename: plain controlled `<input>` in `KanbanColumn`, updates on every
  keystroke via `onRename(columnId, title)`.
- Add card: `NewCardForm` collects title (required) + details (optional,
  defaults to `"No details yet."`), calls `onAddCard`.
- Delete card: button on each `KanbanCard` calls `onDeleteCard`.
- Drag and drop: `DndContext` with `PointerSensor` (6px activation distance)
  and `closestCorners` collision detection. Columns are `useDroppable`; cards
  are `useSortable` inside a `SortableContext` per column. `DragOverlay` shows
  `KanbanCardPreview` for the actively dragged card.
- No card "edit" UI beyond delete/re-add yet — CLAUDE.md's business requirement
  of editing cards is not yet implemented in this demo (add/delete/move/rename
  column only).

## Styling

- Color tokens as CSS custom properties in `globals.css`, matching the palette
  in the project root `CLAUDE.md` (`--accent-yellow`, `--primary-blue`,
  `--secondary-purple`, `--navy-dark`, `--gray-text`), plus `--surface`,
  `--surface-strong`, `--stroke`, `--shadow` for layout chrome.
- `font-display` utility class applies the Space Grotesk variable for headings;
  body text uses Manrope via Tailwind's `font-sans` theme mapping.
- Layout: 5-column CSS grid (`lg:grid-cols-5`) — hardcoded to 5 columns, not
  computed from `board.columns.length`.

## Testing

- Unit/component: `npm run test:unit` (Vitest, jsdom environment). Covers
  `moveCard` logic (`lib/kanban.test.ts`), `KanbanBoard` render/rename/add/
  delete, `LoginForm`, and `AppShell` (the latter two mock `fetch` with
  `vi.stubGlobal` rather than hitting a real backend). Config excludes
  `tests/` (the Playwright dir) from Vitest's glob.
- E2E: `npm run test:e2e` (Playwright, chromium only). Since the app is now
  gated by a real login call, `playwright.config.ts`'s `webServer` no longer
  runs `next dev` (which has no backend) — it runs
  `npm run build && node scripts/e2e-server.mjs`, which builds the static
  export and starts the *real* FastAPI backend (`uv run uvicorn`) serving it,
  with `STATIC_DIR` pointed at the fresh `frontend/out`. This means e2e tests
  exercise the actual full-stack app, auth included, not just the frontend.
  `tests/helpers.ts` exports a `login(page)` helper used by both spec files.
- `npm run test:all` runs unit then e2e.
- If port 3000 is already in use on your machine (e.g. by an unrelated dev
  server), temporarily edit the three `3000`s in `playwright.config.ts`
  (`baseURL`, `webServer.url`, `webServer.env.E2E_PORT`) to a free port,
  run `npx playwright test`, then revert.

## Static export

`next.config.ts` sets `output: "export"`. `npm run build` produces a static
`out/` directory (plain HTML/CSS/JS, no Node server needed) which the root
`Dockerfile`'s `frontend-builder` stage builds and copies into
`backend/src/backend/static/`, where FastAPI serves it. There are no
server-only Next features in use (no route handlers, server actions, or SSR
data fetching), so nothing here should ever need a Node process at runtime.

## Known gaps relative to the full product spec (see root `CLAUDE.md`)

These are expected — later plan parts (see `docs/PLAN.md`) build on this:

- Board data (columns/cards) is still local `useState`, lost on refresh —
  only auth is backed by the real API so far. Part 7 wires up board CRUD.
- No AI chat sidebar.
- Card editing (beyond delete) is not implemented.

## Conventions to preserve when extending

- Client components use `"use client"` at the top; keep components function
  components exported as named `const X = (...) => {...}` (not `export default`,
  except `app/page.tsx` and `app/layout.tsx` which Next requires as default
  exports).
- Board mutation handlers live in `KanbanBoard` and are passed down as props
  (no context/state library) — follow this pattern rather than introducing
  global state unless a later part explicitly warrants it (e.g. wiring to the
  backend may justify a data-fetching hook).
- `data-testid` attributes (`column-<id>`, `card-<id>`) are relied on by both
  Vitest and Playwright specs — keep them stable when refactoring markup.
