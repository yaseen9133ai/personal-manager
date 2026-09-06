import type { BoardData, Card } from "@/lib/kanban";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });

  if (!response.ok) {
    let detail = "Something went wrong.";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // ignore -- fall back to the default message
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export function fetchBoard(): Promise<BoardData> {
  return request<BoardData>("/api/board");
}

export function renameColumn(columnId: string, title: string): Promise<void> {
  return request<void>(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function createCard(
  columnId: string,
  title: string,
  details: string
): Promise<Card> {
  return request<Card>("/api/cards", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, title, details }),
  });
}

export type UpdateCardPayload = {
  title?: string;
  details?: string;
  column_id?: string;
  index?: number;
};

export function updateCard(
  cardId: string,
  payload: UpdateCardPayload
): Promise<Card> {
  return request<Card>(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteCard(cardId: string): Promise<void> {
  return request<void>(`/api/cards/${cardId}`, { method: "DELETE" });
}
