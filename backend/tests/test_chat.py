import os

import pytest
from fastapi.testclient import TestClient

from backend import chat
from backend.main import app

requires_groq_key = pytest.mark.skipif(
    not os.environ.get("GROQ_API_KEY"), reason="GROQ_API_KEY not set"
)


def fake_call_model(reply, board_update=None):
    def _call(messages):
        return chat.ChatModelOutput(reply=reply, board_update=board_update)

    return _call


def test_chat_requires_authentication():
    response = TestClient(app).post("/api/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_reply_only_does_not_change_the_board(client, monkeypatch):
    monkeypatch.setattr(chat, "call_model", fake_call_model("Hi there!"))

    before = client.get("/api/board").json()
    response = client.post("/api/chat", json={"message": "hello"})

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Hi there!"
    assert body["board"] == before


def test_rename_column_action_is_applied_and_persisted(client, monkeypatch):
    action = chat.BoardAction(type="rename_column", column_id="col-backlog", title="Ideas")
    monkeypatch.setattr(chat, "call_model", fake_call_model("Renamed it!", action))

    response = client.post("/api/chat", json={"message": "rename backlog to ideas"})

    assert response.status_code == 200
    renamed = next(
        c for c in response.json()["board"]["columns"] if c["id"] == "col-backlog"
    )
    assert renamed["title"] == "Ideas"

    board = client.get("/api/board").json()
    renamed_again = next(c for c in board["columns"] if c["id"] == "col-backlog")
    assert renamed_again["title"] == "Ideas"


def test_create_card_action_is_applied_and_persisted(client, monkeypatch):
    action = chat.BoardAction(
        type="create_card", column_id="col-backlog", title="From AI", details="via chat"
    )
    monkeypatch.setattr(chat, "call_model", fake_call_model("Added it!", action))

    response = client.post("/api/chat", json={"message": "add a card"})

    assert response.status_code == 200
    board = response.json()["board"]
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    assert len(backlog["cardIds"]) == 1
    card = board["cards"][backlog["cardIds"][0]]
    assert card["title"] == "From AI"
    assert card["details"] == "via chat"


def test_delete_card_action_is_applied_and_persisted(client, monkeypatch):
    created = client.post(
        "/api/cards", json={"column_id": "col-backlog", "title": "Temp"}
    ).json()
    action = chat.BoardAction(type="delete_card", card_id=created["id"])
    monkeypatch.setattr(chat, "call_model", fake_call_model("Deleted it!", action))

    response = client.post("/api/chat", json={"message": "delete that card"})

    assert response.status_code == 200
    assert created["id"] not in response.json()["board"]["cards"]


def test_invalid_column_reference_does_not_corrupt_board(client, monkeypatch):
    action = chat.BoardAction(type="rename_column", column_id="col-nonexistent", title="X")
    monkeypatch.setattr(chat, "call_model", fake_call_model("Done!", action))

    before = client.get("/api/board").json()
    response = client.post("/api/chat", json={"message": "rename a fake column"})

    assert response.status_code == 200
    assert response.json()["reply"] == "Done!"
    assert response.json()["board"] == before


def test_action_missing_required_fields_does_not_corrupt_board(client, monkeypatch):
    action = chat.BoardAction(type="create_card", column_id=None, title=None)
    monkeypatch.setattr(chat, "call_model", fake_call_model("Sure!", action))

    before = client.get("/api/board").json()
    response = client.post("/api/chat", json={"message": "add a card somewhere"})

    assert response.status_code == 200
    assert response.json()["board"] == before


def test_parse_model_output_reply_only():
    output = chat.parse_model_output('{"reply": "hi", "board_update": null}')
    assert output.reply == "hi"
    assert output.board_update is None


def test_parse_model_output_with_action():
    content = (
        '{"reply": "ok", "board_update": {"type": "delete_card", "column_id": null, '
        '"card_id": "card-1", "title": null, "details": null, "target_column_id": null}}'
    )
    output = chat.parse_model_output(content)
    assert output.board_update is not None
    assert output.board_update.type == "delete_card"
    assert output.board_update.card_id == "card-1"


def test_parse_model_output_malformed_json_falls_back_gracefully():
    output = chat.parse_model_output("not json at all")
    assert output.board_update is None
    assert output.reply


def test_parse_model_output_schema_violation_falls_back_gracefully():
    output = chat.parse_model_output('{"board_update": null}')
    assert output.board_update is None
    assert output.reply


@requires_groq_key
def test_live_chat_can_create_a_card(client):
    response = client.post(
        "/api/chat",
        json={"message": "Add a card called 'Buy milk' to the Backlog column."},
    )
    assert response.status_code == 200

    board = client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    titles = [board["cards"][cid]["title"] for cid in backlog["cardIds"]]
    assert any("milk" in title.lower() for title in titles)
