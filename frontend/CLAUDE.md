# Frontend — Kanban Studio

Built with Next.js App Router, statically exported. Fully wired to the real
FastAPI backend now: auth (Part 4) and board data (Part 7) both persist
server-side — there is no client-only demo state left.

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
    ChatSidebar.tsx        # AI chat: message list + input, calls onSendMessage prop
  lib/
    kanban.ts        # types (Card, Column, BoardData), moveCard() (pure reducer)
    auth.ts          # fetchMe(), login(), logout() -- calls /api/auth/*
    board-api.ts     # fetchBoard(), renameColumn(), createCard(), updateCard(),
                      # deleteCard(), sendChatMessage() -- calls /api/board,
                      # /api/columns/*, /api/cards/*, /api/chat
  test/
    setup.ts, vitest.d.ts
tests/
  helpers.ts         # login(page) helper shared by specs
  kanban.spec.ts     # Playwright e2e specs (board interactions)
  auth.spec.ts       # Playwright e2e specs (login/logout flow)
  persistence.spec.ts # Playwright e2e: add/move/rename survive a page reload
  chat.spec.ts       # Playwright e2e specs (real AI chat, board updates live)
scripts/
  e2e-server.mjs     # boots the real backend+static export for e2e (see Testing)
```

## Data model

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

This shape is deliberately identical to the backend's `GET /api/board`
response (see `docs/database.md`) — no translation layer needed.

- `moveCard(columns, activeId, overId)` (`lib/kanban.ts`) is a pure function —
  handles reordering within a column and moving across columns (dropped on a
  card or on an empty column). Used for the local, optimistic part of a drag;
  the actual persistence goes through `board-api.ts`'s `updateCard`.
- Card ids are server-generated (`card-<uuid4 prefix>`, see
  `backend/src/backend/board.py`) — the frontend never invents an id itself.

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
- `KanbanBoard` also takes a required `onSessionExpired` prop, called whenever
  any board API call returns `401` (e.g. the signed session cookie's secret
  changed because the backend restarted — see `backend/CLAUDE.md`'s Auth
  section). `AppShell` wires this to the same "clear user state" effect as
  logout, but without calling `/api/auth/logout` first (there's no valid
  session to log out of).
- Credentials are hardcoded server-side (`user` / `password`); there's no
  signup or per-user data yet (see root `CLAUDE.md`'s MVP limitations).

## State and behavior

- `KanbanBoard` fetches the board from `GET /api/board` on mount (shows
  "Loading board..." until it resolves) and holds the result in a single
  `useState<BoardData>`. Every mutation calls the backend; there is no
  client-only state left, so a page reload or container restart preserves
  everything.
- Column rename: `KanbanColumn`'s input calls `onRename` (live, per keystroke
  — updates local state only, for responsive typing) on `onChange`, and
  `onRenameCommit` on `onBlur` (fires `PATCH /api/columns/{id}`). Splitting
  these avoids firing a network request per keystroke.
- Add card: `NewCardForm` collects title (required) + details (optional,
  defaults to `"No details yet."`), calls `onAddCard`, which awaits
  `POST /api/cards` and adds the server-returned card (with its real id) to
  local state.
- Delete card: button on each `KanbanCard` calls `onDeleteCard`, which awaits
  `DELETE /api/cards/{id}` before removing it from local state.
- Edit card: `KanbanCard` has its own `isEditing` toggle — clicking "Edit"
  swaps in a form (title input + details textarea, prefilled) rendered
  in-place of the card, with Save/Cancel. Save calls `onEditCard`, which
  awaits `PATCH /api/cards/{id}` with `{title, details}` and updates local
  state from the response; Cancel just discards local edits, no API call.
  The editing form's `<article>` deliberately does *not* spread dnd-kit's
  `{...attributes} {...listeners}` (unlike the normal card view) so it isn't
  draggable while being edited.
- Drag and drop: `DndContext` with `PointerSensor` (6px activation distance)
  and `closestCorners` collision detection. Columns are `useDroppable`; cards
  are `useSortable` inside a `SortableContext` per column. `DragOverlay` shows
  `KanbanCardPreview` for the actively dragged card. On drop, the local
  `moveCard` reducer applies immediately (optimistic, for a snappy drag), then
  `PATCH /api/cards/{id}` fires in the background with the resulting
  `column_id`/`index`.
- Errors: any failed mutation calls `reportMutationError`, which re-fetches
  the board (to resync with the server after a partial failure) and shows the
  message in a `data-testid="board-error"` banner. A `401` specifically calls
  the `onSessionExpired` prop instead (see Auth) rather than showing an error.
## AI chat

- `ChatSidebar` owns its own message list (`useState<ChatMessage[]>`) and
  input; it never calls `board-api.ts` itself. It receives one prop,
  `onSendMessage(message, history) => Promise<ChatResult>`, and calls it with
  the message just typed plus the *prior* messages array as `history` (the
  backend appends `message` itself — see `backend/CLAUDE.md`'s AI chat
  section). This mirrors the existing convention of API calls living in
  `KanbanBoard`, keeping `ChatSidebar` a "dumb" presentational component that
  unit tests exercise with a plain mock function, no module mocking needed.
- `KanbanBoard.handleSendChatMessage` is that prop's real implementation:
  calls `board-api.ts`'s `sendChatMessage`, then unconditionally
  `setBoard(result.board)` — the backend always returns the current board
  (whether or not it changed), so the UI stays in sync with zero extra
  fetches and no need to detect "did an update happen?" client-side. A `401`
  triggers `onSessionExpired`, same as every other board mutation.
- Conversation history lives only in `ChatSidebar`'s component state — lost
  on page reload/logout, per the backend's documented Part 9 limitation (no
  `chat_messages` table). Each browser tab's chat starts fresh.
- Layout: the sidebar sits beside the 5-column board grid in a
  `flex-col lg:flex-row` container (stacks on narrow screens, side-by-side
  on `lg`+) — see `KanbanBoard.tsx`'s render. `KanbanBoard`'s "Hide chat" /
  "Show chat" button (`isChatOpen` state) conditionally renders `ChatSidebar`
  entirely — hiding it lets the board grid reclaim the full row width
  (`section` is `flex-1` with no sibling), which matters on laptop-width
  screens where 5 columns + a permanent sidebar get uncomfortably narrow for
  dragging. Prefer this over shrinking the sidebar further if width still
  feels tight — verified at 1366/1440/1920px via real screenshots, not just
  assumed from the Tailwind classes.
- `ChatSidebar`'s own "New chat" button (visible once there's at least one
  message) clears its local `messages` state back to empty — the only way to
  reset a conversation, since history is never persisted (see above).
- The sidebar's own heading is "Ask Kanban Studio" (`<h2>`), which is a
  substring of the board's own "Kanban Studio" `<h1>` — Playwright's
  role/name queries do substring matching by default, so any e2e locator for
  the board heading needs `{ name: "Kanban Studio", exact: true }` to avoid
  matching both. `tests/helpers.ts`'s `login()` already does this.

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
  `moveCard` logic (`lib/kanban.test.ts`), `LoginForm`/`AppShell` (mock
  `fetch` directly with `vi.stubGlobal`), `KanbanBoard` (mocks the whole
  `@/lib/board-api` module with `vi.mock` and asserts each action calls the
  right endpoint with the right payload, including that a chat response's
  `board` triggers a visible re-render), and `ChatSidebar` (passed a plain
  mock `onSendMessage` function directly — no module mocking needed, see AI
  chat section) — none hit a real backend. Config excludes `tests/` (the
  Playwright dir) from Vitest's glob.
- E2E: `npm run test:e2e` (Playwright, chromium only). Since the app is now
  gated by a real login call, `playwright.config.ts`'s `webServer` no longer
  runs `next dev` (which has no backend) — it runs
  `npm run build && node scripts/e2e-server.mjs`, which builds the static
  export and starts the *real* FastAPI backend (`uv run uvicorn`) serving it,
  with `STATIC_DIR` pointed at the fresh `frontend/out` and `DB_PATH` pointed
  at a throwaway `.e2e-data/test.db` (wiped at the start of every run — never
  the developer's real `backend/data/app.db`). This means e2e tests exercise
  the actual full-stack app, auth and persistence included, not just the
  frontend. Since real boards start with 5 empty columns (no seeded demo
  cards), specs that need a card create one via the UI first.
  `tests/helpers.ts` exports a `login(page)` helper used by all spec files.
  `chat.spec.ts` makes real Groq calls (no mocking) — same tradeoff as the
  backend's live tests: slower and non-deterministic in content, but proves
  the actual integration works, not just our own mocked assumptions about it.
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

All of the root `CLAUDE.md`'s business requirements are implemented as of
this point: sign-in, drag-and-drop board with renameable columns, card
create/edit/move/delete, and an AI chat sidebar that can update the board.

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
