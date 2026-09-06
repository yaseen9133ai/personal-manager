import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    db.reset_connection()

    test_client = TestClient(app)
    test_client.post("/api/auth/login", json={"username": "user", "password": "password"})
    yield test_client

    db.reset_connection()
