"use client";

import { useState, type FormEvent } from "react";
import type { ChatMessage, ChatResult } from "@/lib/board-api";

type ChatSidebarProps = {
  onSendMessage: (
    message: string,
    history: ChatMessage[]
  ) => Promise<ChatResult>;
};

export const ChatSidebar = ({ onSendMessage }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const result = await onSendMessage(trimmed, history);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setError(null);
  };

  return (
    // No backdrop-blur here: it's a GPU-expensive compositing effect, and
    // dnd-kit's DragOverlay repositions the dragged card every animation
    // frame while dragging -- a blurred panel sharing the frame with that
    // continuous animation is what made dragging feel choppy specifically
    // while the sidebar was open (hiding it removed the only other blurred
    // panel on screen besides the header).
    <aside className="flex w-full flex-col gap-4 rounded-[32px] border border-[var(--stroke)] bg-white/95 p-6 shadow-[var(--shadow)] lg:w-80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            AI Assistant
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-[var(--navy-dark)]">
            Ask Kanban Studio
          </h2>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            New chat
          </button>
        )}
      </div>

      <div
        data-testid="chat-messages"
        className="flex min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto"
      >
        {messages.length === 0 && (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask me to add, edit, move, or remove cards, or rename a column --
            or just chat.
          </p>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            data-testid={`chat-message-${msg.role}`}
            className={
              msg.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl bg-[var(--secondary-purple)] px-4 py-2 text-sm text-white"
                : "mr-auto max-w-[85%] rounded-2xl bg-[var(--surface)] px-4 py-2 text-sm text-[var(--navy-dark)]"
            }
          >
            {msg.content}
          </div>
        ))}
        {isSending && (
          <div
            data-testid="chat-thinking"
            className="mr-auto max-w-[85%] rounded-2xl bg-[var(--surface)] px-4 py-2 text-sm text-[var(--gray-text)]"
          >
            Thinking...
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="chat-error"
          className="text-sm font-medium text-red-600"
        >
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask the AI..."
          aria-label="Chat message"
          disabled={isSending}
          className="flex-1 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
