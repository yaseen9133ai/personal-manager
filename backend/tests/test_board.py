from fastapi.testclient import TestClient

from backend import db
from backend.board import create_card
from backend.main import app


def test_board_requires_authentication():
    response = TestClient(app).get("/api/board")
    assert response.status_code == 401


def test_board_returns_seeded_columns_and_no_cards(client):
    response = client.get("/api/board")
    assert response.status_code == 200
    body = response.json()
    assert [c["id"] for c in body["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert body["cards"] == {}
    assert all(c["cardIds"] == [] for c in body["columns"])


def test_rename_column(client):
    response = client.patch("/api/columns/col-backlog", json={"title": "Ideas"})
    assert response.status_code == 200

    board = client.get("/api/board").json()
    renamed = next(c for c in board["columns"] if c["id"] == "col-backlog")
    assert renamed["title"] == "Ideas"


def test_rename_unknown_column_is_404(client):
    response = client.patch("/api/columns/col-nonexistent", json={"title": "X"})
    assert response.status_code == 404


def test_rename_column_rejects_empty_title(client):
    response = client.patch("/api/columns/col-backlog", json={"title": ""})
    assert response.status_code == 422


def test_create_card(client):
    response = client.post(
        "/api/cards",
        json={"column_id": "col-backlog", "title": "Write docs", "details": "For part 6"},
    )
    assert response.status_code == 201
    card = response.json()
    assert card["title"] == "Write docs"
    assert card["details"] == "For part 6"

    board = client.get("/api/board").json()
    assert card["id"] in board["cards"]
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    assert backlog["cardIds"] == [card["id"]]


def test_create_card_in_unknown_column_is_404(client):
    response = client.post(
        "/api/cards", json={"column_id": "col-nonexistent", "title": "X"}
    )
    assert response.status_code == 404


def test_create_card_rejects_empty_title(client):
    response = client.post("/api/cards", json={"column_id": "col-backlog", "title": ""})
    assert response.status_code == 422


def test_update_card_title_and_details(client):
    card = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "Draft"}
    ).json()

    response = client.patch(
        f"/api/cards/{card['id']}", json={"title": "Final", "details": "Done"}
    )
    assert response.status_code == 200
    assert response.json() == {"id": card["id"], "title": "Final", "details": "Done"}


def test_update_unknown_card_is_404(client):
    response = client.patch("/api/cards/card-nope", json={"title": "X"})
    assert response.status_code == 404


def test_move_card_to_another_column(client):
    card = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "Move me"}
    ).json()

    response = client.patch(f"/api/cards/{card['id']}", json={"column_id": "col-review"})
    assert response.status_code == 200

    board = client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    review = next(c for c in board["columns"] if c["id"] == "col-review")
    assert card["id"] not in backlog["cardIds"]
    assert review["cardIds"] == [card["id"]]


def test_move_card_to_unknown_column_is_404(client):
    card = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "Card"}
    ).json()
    response = client.patch(
        f"/api/cards/{card['id']}", json={"column_id": "col-nonexistent"}
    )
    assert response.status_code == 404


def test_reorder_cards_within_a_column(client):
    first = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "First"}
    ).json()
    second = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "Second"}
    ).json()

    response = client.patch(f"/api/cards/{second['id']}", json={"index": 0})
    assert response.status_code == 200

    board = client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    assert backlog["cardIds"] == [second["id"], first["id"]]


def test_delete_card(client):
    card = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "Temp"}
    ).json()

    response = client.delete(f"/api/cards/{card['id']}")
    assert response.status_code == 204

    board = client.get("/api/board").json()
    assert card["id"] not in board["cards"]


def test_delete_unknown_card_is_404(client):
    response = client.delete("/api/cards/card-nope")
    assert response.status_code == 404


def test_second_user_cannot_see_or_modify_first_users_board(client):
    conn = db.get_connection()
    conn.execute("INSERT INTO users (username) VALUES ('other')")
    conn.commit()
    other_user_id = db.get_user_id(conn, "other")
    conn.execute(
        "INSERT INTO board_columns (user_id, slug, title, position) "
        "VALUES (?, 'col-backlog', 'Backlog', 0)",
        (other_user_id,),
    )
    conn.commit()
    other_card = create_card(conn, other_user_id, "col-backlog", "Secret", "")

    board = client.get("/api/board").json()
    assert other_card.id not in board["cards"]

    response = client.patch(f"/api/cards/{other_card.id}", json={"title": "Hacked"})
    assert response.status_code == 404

    response = client.delete(f"/api/cards/{other_card.id}")
    assert response.status_code == 404
