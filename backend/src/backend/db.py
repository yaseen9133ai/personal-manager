import os
import sqlite3
import threading
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "app.db"
HARDCODED_USERNAME = "user"

DEFAULT_COLUMNS = [
    ("col-backlog", "Backlog", 0),
    ("col-discovery", "Discovery", 1),
    ("col-progress", "In Progress", 2),
    ("col-review", "Review", 3),
    ("col-done", "Done", 4),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS board_columns (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, slug)
);

CREATE TABLE IF NOT EXISTS cards (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    column_slug TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, column_slug) REFERENCES board_columns(user_id, slug) ON DELETE CASCADE
);
"""

_connection: sqlite3.Connection | None = None
_connection_lock = threading.Lock()


def get_db_path() -> Path:
    return Path(os.environ.get("DB_PATH", str(DEFAULT_DB_PATH)))


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT OR IGNORE INTO users (username) VALUES (?)", (HARDCODED_USERNAME,)
    )
    conn.commit()

    user_id = get_user_id(conn, HARDCODED_USERNAME)
    for slug, title, position in DEFAULT_COLUMNS:
        conn.execute(
            "INSERT OR IGNORE INTO board_columns (user_id, slug, title, position) "
            "VALUES (?, ?, ?, ?)",
            (user_id, slug, title, position),
        )
    conn.commit()


def get_user_id(conn: sqlite3.Connection, username: str) -> int | None:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    return row["id"] if row else None


def get_connection() -> sqlite3.Connection:
    global _connection
    # FastAPI runs sync routes in a thread pool, so concurrent first-time
    # requests can otherwise race to open+init the same fresh DB file at
    # once, which SQLite surfaces as "database is locked".
    if _connection is None:
        with _connection_lock:
            if _connection is None:
                db_path = get_db_path()
                db_path.parent.mkdir(parents=True, exist_ok=True)
                conn = sqlite3.connect(db_path, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys = ON")
                conn.execute("PRAGMA journal_mode = WAL")
                # The single connection is shared across FastAPI's threadpool
                # threads; busy_timeout makes concurrent writes wait for the
                # lock instead of immediately raising "database is locked".
                conn.execute("PRAGMA busy_timeout = 5000")
                init_db(conn)
                _connection = conn
    return _connection


def reset_connection() -> None:
    """Test-only: force get_connection() to reopen against the current DB_PATH."""
    global _connection
    if _connection is not None:
        _connection.close()
    _connection = None
