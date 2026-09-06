from fastapi.testclient import TestClient

from backend.main import app


def test_login_with_valid_credentials_sets_session_cookie() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies


def test_login_with_invalid_credentials_is_rejected() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401


def test_me_without_session_is_unauthorized() -> None:
    client = TestClient(app)
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_with_valid_session_returns_user() -> None:
    client = TestClient(app)
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session() -> None:
    client = TestClient(app)
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    logout_response = client.post("/api/auth/logout")
    me_response = client.get("/api/auth/me")

    assert logout_response.status_code == 200
    assert me_response.status_code == 401


def test_tampered_session_cookie_is_rejected() -> None:
    client = TestClient(app)
    client.post("/api/auth/login", json={"username": "user", "password": "password"})
    client.cookies.set("session", "user.deadbeef")

    response = client.get("/api/auth/me")

    assert response.status_code == 401
