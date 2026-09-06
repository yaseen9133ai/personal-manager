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


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
