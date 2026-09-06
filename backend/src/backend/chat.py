import json
import sqlite3
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from backend.ai import MODEL, get_client
from backend.board import (
    BoardOut,
    UpdateCardRequest,
    create_card,
    delete_card,
    get_board,
    rename_column,
    update_card,
)

ActionType = Literal["rename_column", "create_card", "update_card", "delete_card"]


class BoardAction(BaseModel):
    type: ActionType
    column_id: str | None = None
    card_id: str | None = None
    title: str | None = None
    details: str | None = None
    target_column_id: str | None = None


class ChatModelOutput(BaseModel):
    reply: str
    board_update: BoardAction | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    board: BoardOut


# A single flat action shape (rather than a schema per action type) keeps
# this to one JSON schema Groq's strict mode has to enforce, at the cost of
# some fields being irrelevant depending on "type" -- simpler than a
# discriminated union, and each action still maps 1:1 onto an existing
# Part 6 board.py function.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "board_update": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "rename_column",
                                "create_card",
                                "update_card",
                                "delete_card",
                            ],
                        },
                        "column_id": {"type": ["string", "null"]},
                        "card_id": {"type": ["string", "null"]},
                        "title": {"type": ["string", "null"]},
                        "details": {"type": ["string", "null"]},
                        "target_column_id": {"type": ["string", "null"]},
                    },
                    "required": [
                        "type",
                        "column_id",
                        "card_id",
                        "title",
                        "details",
                        "target_column_id",
                    ],
                    "additionalProperties": False,
                },
            ]
        },
    },
    "required": ["reply", "board_update"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """You are an assistant embedded in a Kanban board app called Kanban Studio.
You can see the current board as JSON and may optionally propose ONE change to it per reply.

Board JSON shape: {"columns": [{"id": "col-backlog", "title": "Backlog", "cardIds": [...]}, ...], "cards": {"card-x": {"id": "card-x", "title": "...", "details": "..."}}}.
The 5 columns are fixed and always present with these ids: col-backlog, col-discovery, col-progress, col-review, col-done. You may rename their titles but never add, remove, or invent a column id.

If the user's request needs a board change, set "board_update" to exactly one action:
- rename_column: set column_id (an existing column id) and title (the new title).
- create_card: set column_id (an existing column id to add to), title, and details (empty string if unspecified).
- update_card: set card_id (an existing card id) and any of title/details/target_column_id to change; leave the others null.
- delete_card: set card_id (an existing card id).
Only ever reference column_id/card_id values that actually appear in the board JSON above -- never invent one.
If no board change is needed, set "board_update" to null.
Always fill in "reply" with a short, friendly, natural-language reply to the user.
"""


def build_messages(
    board: BoardOut, history: list[ChatMessage], message: str
) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Current board:\n{board.model_dump_json()}"},
    ]
    messages.extend({"role": m.role, "content": m.content} for m in history)
    messages.append({"role": "user", "content": message})
    return messages


def parse_model_output(content: str) -> ChatModelOutput:
    try:
        data = json.loads(content)
        return ChatModelOutput.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        fallback_reply = content.strip() or "Sorry, I couldn't process that -- please try again."
        return ChatModelOutput(reply=fallback_reply, board_update=None)


def call_model(messages: list[dict[str, str]]) -> ChatModelOutput:
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "chat_reply",
                "schema": RESPONSE_SCHEMA,
                "strict": True,
            },
        },
    )
    content = response.choices[0].message.content or ""
    return parse_model_output(content)


def apply_action(conn: sqlite3.Connection, user_id: int, action: BoardAction) -> None:
    if action.type == "rename_column":
        if not action.column_id or not action.title:
            raise ValueError("rename_column requires column_id and title")
        rename_column(conn, user_id, action.column_id, action.title)
    elif action.type == "create_card":
        if not action.column_id or not action.title:
            raise ValueError("create_card requires column_id and title")
        create_card(conn, user_id, action.column_id, action.title, action.details or "")
    elif action.type == "update_card":
        if not action.card_id:
            raise ValueError("update_card requires card_id")
        update_card(
            conn,
            user_id,
            action.card_id,
            UpdateCardRequest(
                title=action.title or None,
                details=action.details,
                column_id=action.target_column_id,
            ),
        )
    elif action.type == "delete_card":
        if not action.card_id:
            raise ValueError("delete_card requires card_id")
        delete_card(conn, user_id, action.card_id)


def handle_chat(
    conn: sqlite3.Connection, user_id: int, request: ChatRequest
) -> ChatResponse:
    board = get_board(conn, user_id)
    messages = build_messages(board, request.history, request.message)
    model_output = call_model(messages)

    if model_output.board_update is not None:
        try:
            apply_action(conn, user_id, model_output.board_update)
        except (LookupError, ValueError, ValidationError):
            # Invalid/malformed action (e.g. references a column or card
            # that doesn't exist) -- leave the board untouched but still
            # return the model's reply rather than failing the request.
            pass

    return ChatResponse(reply=model_output.reply, board=get_board(conn, user_id))
