from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.services import agent_service
from tests.conftest import auth_headers

TOOLS = [{"name": "run_commands", "description": "Run a script", "parameters": {"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]}}]


def _configure(client: TestClient, headers: dict[str, str]) -> None:
    resp = client.put("/ai/config", json={"provider": "openai", "api_base": None, "model": "test", "api_key": "sk-test"}, headers=headers)
    assert resp.status_code == 200


def test_step_returns_tool_calls_and_then_text(client: TestClient, monkeypatch) -> None:
    seen: list[list] = []

    def fake(messages, info: AgentInfo) -> ModelResponse:
        seen.append(messages)
        assert [t.name for t in info.function_tools] == ["run_commands"]
        if len(messages) == 1:
            return ModelResponse(parts=[TextPart(content="Drawing."), ToolCallPart(tool_name="run_commands", args={"script": "CIRCLE 0,0 10"}, tool_call_id="t1")])
        return ModelResponse(parts=[TextPart(content="Done.")])

    monkeypatch.setattr(agent_service, "_build_model", lambda cfg: FunctionModel(fake))
    h = auth_headers(client, "agent@example.com")
    _configure(client, h)
    r1 = client.post("/agent/step", json={"system": "You are a test.", "messages": [{"role": "user", "text": "circle"}], "tools": TOOLS}, headers=h)
    assert r1.status_code == 200
    body = r1.json()
    assert body["tool_calls"] == [{"id": "t1", "name": "run_commands", "args": {"script": "CIRCLE 0,0 10"}}]
    msgs = [
        {"role": "user", "text": "circle"},
        {"role": "assistant", "text": "Drawing.", "toolCalls": body["tool_calls"], "raw": body["raw"]},
        {"role": "tool", "results": [{"id": "t1", "name": "run_commands", "text": "OK\nCreated: CIRCLE center 0,0,0 r 10"}]},
    ]
    r2 = client.post("/agent/step", json={"system": "You are a test.", "messages": msgs, "tools": TOOLS}, headers=h)
    assert r2.json()["text"] == "Done."
    # El sistema va en el primer pedido y el resultado de la herramienta vuelve al modelo.
    assert "You are a test." in repr(seen[0][0])
    assert "CIRCLE center 0,0,0 r 10" in repr(seen[1][-1])


def test_step_needs_a_server_key_and_login(client: TestClient) -> None:
    assert client.post("/agent/step", json={"system": "s", "messages": [], "tools": []}).status_code == 401
    h = auth_headers(client, "nokey@example.com")
    assert client.post("/agent/step", json={"system": "s", "messages": [], "tools": []}, headers=h).status_code == 400


def test_conversations_are_saved_per_user(client: TestClient) -> None:
    a = auth_headers(client, "a@example.com")
    b = auth_headers(client, "b@example.com")
    r = client.put("/agent/conversations/c1", json={"title": "Plate", "messages": [{"role": "user", "text": "plate"}], "context": 120}, headers=a)
    assert r.status_code == 200
    assert [c["title"] for c in client.get("/agent/conversations", headers=a).json()] == ["Plate"]
    assert client.get("/agent/conversations", headers=b).json() == []
