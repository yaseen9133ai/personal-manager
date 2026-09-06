import os
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.auth import (
    SESSION_COOKIE,
    VALID_PASSWORD,
    VALID_USERNAME,
    sign_session,
    verify_session,
)
from backend.board import (
    BoardOut,
    CardOut,
    CreateCardRequest,
    RenameColumnRequest,
    UpdateCardRequest,
    create_card,
    delete_card,
    get_board,
    rename_column,
    update_card,
)
from backend.chat import ChatRequest, ChatResponse, handle_chat
from backend.db import get_connection, get_user_id

app = FastAPI(title="Personal Manager backend")

STATIC_DIR = Path(os.environ.get("STATIC_DIR", str(Path(__file__).parent / "static")))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    username: str


def get_current_user(session: str | None = Cookie(default=None)) -> str:
    username = verify_session(session) if session else None
    if username is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


@app.post("/api/auth/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response) -> UserOut:
    if payload.username != VALID_USERNAME or payload.password != VALID_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    response.set_cookie(
        SESSION_COOKIE,
        sign_session(payload.username),
        httponly=True,
        samesite="lax",
    )
    return UserOut(username=payload.username)


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(SESSION_COOKIE)
    return {"status": "ok"}


@app.get("/api/auth/me", response_model=UserOut)
def me(username: str = Depends(get_current_user)) -> UserOut:
    return UserOut(username=username)


def get_current_user_id(username: str = Depends(get_current_user)) -> int:
    user_id = get_user_id(get_connection(), username)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


@app.get("/api/board", response_model=BoardOut)
def read_board(user_id: int = Depends(get_current_user_id)) -> BoardOut:
    return get_board(get_connection(), user_id)


@app.patch("/api/columns/{column_id}")
def rename_column_route(
    column_id: str,
    payload: RenameColumnRequest,
    user_id: int = Depends(get_current_user_id),
) -> dict[str, str]:
    try:
        rename_column(get_connection(), user_id, column_id, payload.title)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok"}


@app.post("/api/cards", response_model=CardOut, status_code=201)
def create_card_route(
    payload: CreateCardRequest, user_id: int = Depends(get_current_user_id)
) -> CardOut:
    try:
        return create_card(
            get_connection(), user_id, payload.column_id, payload.title, payload.details
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/cards/{card_id}", response_model=CardOut)
def update_card_route(
    card_id: str,
    payload: UpdateCardRequest,
    user_id: int = Depends(get_current_user_id),
) -> CardOut:
    try:
        return update_card(get_connection(), user_id, card_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/cards/{card_id}", status_code=204, response_class=Response)
def delete_card_route(
    card_id: str, user_id: int = Depends(get_current_user_id)
) -> Response:
    try:
        delete_card(get_connection(), user_id, card_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)


@app.post("/api/chat", response_model=ChatResponse)
def chat_route(
    payload: ChatRequest, user_id: int = Depends(get_current_user_id)
) -> ChatResponse:
    return handle_chat(get_connection(), user_id, payload)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
