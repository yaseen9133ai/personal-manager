"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { moveCard, type BoardData } from "@/lib/kanban";
import {
  ApiError,
  createCard as createCardApi,
  deleteCard as deleteCardApi,
  fetchBoard,
  renameColumn as renameColumnApi,
  sendChatMessage as sendChatMessageApi,
  updateCard as updateCardApi,
  type ChatMessage,
  type ChatResult,
} from "@/lib/board-api";

type KanbanBoardProps = {
  onLogout: () => void;
  onSessionExpired: () => void;
};

const emptyBoard: BoardData = { columns: [], cards: {} };

export const KanbanBoard = ({ onLogout, onSessionExpired }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(emptyBoard);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // closestCorners compares the whole dragged card's rect against every
  // droppable's corners, which for a short drag into an adjacent column
  // (e.g. Backlog -> Discovery) can keep favoring the source column right
  // up to the boundary -- the card visually snaps back instead of moving.
  // pointerWithin checks the actual cursor position instead, so crossing
  // into the next column registers immediately; rectIntersection is only a
  // fallback for the rare frame where the pointer sits in a gap between
  // droppables.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
  };

  const cardsById = useMemo(() => board.cards, [board.cards]);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load board.");
      })
      .finally(() => setIsLoading(false));
  }, [onSessionExpired]);

  const reportMutationError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      onSessionExpired();
      return;
    }
    setError(err instanceof Error ? err.message : "Something went wrong.");
    // The mutation may have partially failed server-side -- resync with the
    // source of truth rather than leaving an optimistic guess on screen.
    fetchBoard()
      .then(setBoard)
      .catch(() => {});
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;
    const nextColumns = moveCard(board.columns, activeId, overId);
    if (nextColumns === board.columns) {
      // moveCard returns the same array reference when it couldn't resolve
      // the drop into an actual change -- nothing moved, so skip the state
      // update and the PATCH below.
      return;
    }
    setBoard((prev) => ({ ...prev, columns: nextColumns }));

    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(activeId)
    );
    if (targetColumn) {
      const index = targetColumn.cardIds.indexOf(activeId);
      updateCardApi(activeId, { column_id: targetColumn.id, index }).catch(
        reportMutationError
      );
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleRenameColumnCommit = (columnId: string, title: string) => {
    renameColumnApi(columnId, title).catch(reportMutationError);
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    createCardApi(columnId, title, details || "No details yet.")
      .then((card) => {
        setBoard((prev) => ({
          ...prev,
          cards: { ...prev.cards, [card.id]: card },
          columns: prev.columns.map((column) =>
            column.id === columnId
              ? { ...column, cardIds: [...column.cardIds, card.id] }
              : column
          ),
        }));
      })
      .catch(reportMutationError);
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    deleteCardApi(cardId)
      .then(() => {
        setBoard((prev) => ({
          ...prev,
          cards: Object.fromEntries(
            Object.entries(prev.cards).filter(([id]) => id !== cardId)
          ),
          columns: prev.columns.map((column) =>
            column.id === columnId
              ? {
                  ...column,
                  cardIds: column.cardIds.filter((id) => id !== cardId),
                }
              : column
          ),
        }));
      })
      .catch(reportMutationError);
  };

  const handleEditCard = (cardId: string, title: string, details: string) => {
    updateCardApi(cardId, { title, details })
      .then((updatedCard) => {
        setBoard((prev) => ({
          ...prev,
          cards: { ...prev.cards, [cardId]: updatedCard },
        }));
      })
      .catch(reportMutationError);
  };

  const handleSendChatMessage = async (
    message: string,
    history: ChatMessage[]
  ): Promise<ChatResult> => {
    try {
      const result = await sendChatMessageApi(message, history);
      setBoard(result.board);
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
      }
      throw err;
    }
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">
        Loading board...
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1800px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-[var(--surface-translucent)] p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
              {error && (
                <p
                  role="alert"
                  data-testid="board-error"
                  className="mt-3 text-sm font-medium text-red-600"
                >
                  {error}
                </p>
              )}
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen((prev) => !prev)}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                {isChatOpen ? "Hide chat" : "Show chat"}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Log out
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid flex-1 gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onRenameCommit={handleRenameColumnCommit}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {isChatOpen && (
            <ChatSidebar onSendMessage={handleSendChatMessage} />
          )}
        </div>
      </main>
    </div>
  );
};
