import sqlite3
import uuid

from pydantic import BaseModel, Field


class CardOut(BaseModel):
    id: str
    title: str
    details: str


class ColumnOut(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardOut(BaseModel):
    columns: list[ColumnOut]
    cards: dict[str, CardOut]


class RenameColumnRequest(BaseModel):
    title: str = Field(min_length=1)


class CreateCardRequest(BaseModel):
    column_id: str
    title: str = Field(min_length=1)
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    details: str | None = None
    column_id: str | None = None
    index: int | None = Field(default=None, ge=0)


def get_board(conn: sqlite3.Connection, user_id: int) -> BoardOut:
    column_rows = conn.execute(
        "SELECT slug, title FROM board_columns WHERE user_id = ? ORDER BY position",
        (user_id,),
    ).fetchall()

    card_rows = conn.execute(
        "SELECT id, column_slug, title, details FROM cards "
        "WHERE user_id = ? ORDER BY position",
        (user_id,),
    ).fetchall()

    card_ids_by_column: dict[str, list[str]] = {row["slug"]: [] for row in column_rows}
    cards: dict[str, CardOut] = {}
    for row in card_rows:
        card_ids_by_column.setdefault(row["column_slug"], []).append(row["id"])
        cards[row["id"]] = CardOut(
            id=row["id"], title=row["title"], details=row["details"]
        )

    columns = [
        ColumnOut(
            id=row["slug"],
            title=row["title"],
            cardIds=card_ids_by_column.get(row["slug"], []),
        )
        for row in column_rows
    ]

    return BoardOut(columns=columns, cards=cards)


def rename_column(conn: sqlite3.Connection, user_id: int, slug: str, title: str) -> None:
    cursor = conn.execute(
        "UPDATE board_columns SET title = ? WHERE user_id = ? AND slug = ?",
        (title, user_id, slug),
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise LookupError("Column not found")


def create_card(
    conn: sqlite3.Connection, user_id: int, column_id: str, title: str, details: str
) -> CardOut:
    column = conn.execute(
        "SELECT 1 FROM board_columns WHERE user_id = ? AND slug = ?",
        (user_id, column_id),
    ).fetchone()
    if column is None:
        raise LookupError("Column not found")

    next_position = conn.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM cards "
        "WHERE user_id = ? AND column_slug = ?",
        (user_id, column_id),
    ).fetchone()["next_position"]

    card_id = f"card-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "INSERT INTO cards (user_id, id, column_slug, title, details, position) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, card_id, column_id, title, details, next_position),
    )
    conn.commit()
    return CardOut(id=card_id, title=title, details=details)


def update_card(
    conn: sqlite3.Connection, user_id: int, card_id: str, payload: UpdateCardRequest
) -> CardOut:
    row = conn.execute(
        "SELECT column_slug, title, details FROM cards WHERE user_id = ? AND id = ?",
        (user_id, card_id),
    ).fetchone()
    if row is None:
        raise LookupError("Card not found")

    new_title = payload.title if payload.title is not None else row["title"]
    new_details = payload.details if payload.details is not None else row["details"]
    target_column = (
        payload.column_id if payload.column_id is not None else row["column_slug"]
    )

    if target_column != row["column_slug"]:
        column_exists = conn.execute(
            "SELECT 1 FROM board_columns WHERE user_id = ? AND slug = ?",
            (user_id, target_column),
        ).fetchone()
        if column_exists is None:
            raise LookupError("Target column not found")

    conn.execute(
        "UPDATE cards SET title = ?, details = ?, column_slug = ? "
        "WHERE user_id = ? AND id = ?",
        (new_title, new_details, target_column, user_id, card_id),
    )

    if payload.column_id is not None or payload.index is not None:
        _reorder_column(conn, user_id, target_column, card_id, payload.index)

    conn.commit()
    return CardOut(id=card_id, title=new_title, details=new_details)


def _reorder_column(
    conn: sqlite3.Connection,
    user_id: int,
    column_slug: str,
    moved_card_id: str,
    index: int | None,
) -> None:
    rows = conn.execute(
        "SELECT id FROM cards WHERE user_id = ? AND column_slug = ? ORDER BY position",
        (user_id, column_slug),
    ).fetchall()
    ordered_ids = [row["id"] for row in rows if row["id"] != moved_card_id]
    insert_at = len(ordered_ids) if index is None else min(index, len(ordered_ids))
    ordered_ids.insert(insert_at, moved_card_id)

    for position, cid in enumerate(ordered_ids):
        conn.execute(
            "UPDATE cards SET position = ? WHERE user_id = ? AND id = ?",
            (position, user_id, cid),
        )


def delete_card(conn: sqlite3.Connection, user_id: int, card_id: str) -> None:
    cursor = conn.execute(
        "DELETE FROM cards WHERE user_id = ? AND id = ?", (user_id, card_id)
    )
    conn.commit()
    if cursor.rowcount == 0:
        raise LookupError("Card not found")
