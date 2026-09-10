import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);

  // If the card changes from outside this form while it's open (e.g. the AI
  // chat sidebar edits the same card), drop out of editing rather than
  // risking Save overwriting the newer server value with stale local edits.
  // The card's own save flow already sets isEditing false before this runs,
  // so it never fights with a normal save.
  useEffect(() => {
    if (isEditing) {
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.title, card.details]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }
    onEdit(card.id, trimmedTitle, details.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <article
        ref={setNodeRef}
        style={style}
        className="rounded-2xl border border-[var(--primary-blue)] bg-[var(--surface-strong)] px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]"
        data-testid={`card-${card.id}`}
      >
        <div className="space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            aria-label="Card title"
            autoFocus
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--gray-text)] outline-none focus:border-[var(--primary-blue)]"
            aria-label="Card details"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-[var(--surface-strong)] px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
            aria-label={`Edit ${card.title}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(card.id)}
            className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
            aria-label={`Delete ${card.title}`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
};
