"""Tests del router de IA. No llama al LLM real: se mockea ai_service.generate."""

import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.ai import AiOperations, AiResult, EntityOp
from app.services import ai_pipeline, ai_service
from tests.conftest import auth_headers


class _FakeRun:
    def __init__(self, output: AiResult) -> None:
        self.output = output


class _FakeAgent:
    """Agente que devuelve salidas predefinidas por llamada (para probar el retry)."""

    def __init__(self, outputs: list[AiResult]) -> None:
        self._outputs = outputs
        self.calls = 0

    async def run(self, msg: str) -> _FakeRun:
        out = self._outputs[min(self.calls, len(self._outputs) - 1)]
        self.calls += 1
        return _FakeRun(out)


async def _no_sleep(_s: float) -> None:
    return None


_CIRCLE = EntityOp(action="add", type="CIRCLE", props={"center": [0, 0, 0], "radius": 5})


def test_ai_config_roundtrip_masks_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    # La protección SSRF exige que el api_base esté en la allowlist; se habilita sólo para el test.
    monkeypatch.setattr(get_settings(), "ai_allowed_base_urls", "https://x/v1")
    h = auth_headers(client, "ai1@example.com")
    # sin configurar
    r = client.get("/ai/config", headers=h)
    assert r.status_code == 200
    assert r.json()["has_key"] is False

    # api_base fuera de la allowlist se rechaza (anti-SSRF)
    r = client.put(
        "/ai/config",
        headers=h,
        json={"provider": "openai", "api_base": "https://evil/v1", "model": "m", "api_key": "SECRET"},
    )
    assert r.status_code == 422

    # configurar con api_base permitido
    r = client.put(
        "/ai/config",
        headers=h,
        json={"provider": "openai", "api_base": "https://x/v1", "model": "m", "api_key": "SECRET"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["has_key"] is True
    assert "api_key" not in body  # nunca se devuelve la key

    # GET enmascarado
    r = client.get("/ai/config", headers=h)
    assert r.json() == {"provider": "openai", "api_base": "https://x/v1", "model": "m", "has_key": True}


def test_config_does_not_leak_ai_key(client: TestClient) -> None:
    h = auth_headers(client, "ai2@example.com")
    client.put("/ai/config", headers=h, json={"provider": "openai", "model": "m", "api_key": "TOPSECRET"})
    # guardar settings de UI no debe borrar la config del LLM ni exponerla
    client.put("/config", headers=h, json={"data": {"theme": {"background": "#000000"}}})
    r = client.get("/config", headers=h)
    dumped = r.text
    assert "TOPSECRET" not in dumped
    assert "_ai" not in r.json()["data"]
    # la key sigue viva del lado servidor
    assert client.get("/ai/config", headers=h).json()["has_key"] is True


def test_generate_requires_config(client: TestClient) -> None:
    h = auth_headers(client, "ai3@example.com")
    r = client.post("/ai/generate", headers=h, json={"prompt": "hi", "document": {"entities": []}})
    assert r.status_code == 400


def test_generate_returns_operations(client: TestClient, monkeypatch) -> None:
    h = auth_headers(client, "ai4@example.com")
    client.put("/ai/config", headers=h, json={"provider": "openai", "model": "m", "api_key": "K"})

    async def fake_generate(cfg, prompt, document):
        return AiResult(
            operations=[EntityOp(action="add", type="CIRCLE", layer="0", props={"center": [0, 0, 0], "radius": 5, "normal": [0, 0, 1]})],
            message="added a circle",
        )

    monkeypatch.setattr(ai_service, "generate", fake_generate)
    # Documento con contenido → path de edición de un solo paso (ai_service.generate, mockeado).
    doc = {"entities": [{"id": "e1", "type": "LINE", "props": {"start": [0, 0, 0], "end": [1, 0, 0]}}]}
    r = client.post("/ai/generate", headers=h, json={"prompt": "circle", "document": doc})
    assert r.status_code == 200
    body = r.json()
    assert body["message"] == "added a circle"
    assert body["operations"][0]["type"] == "CIRCLE"


def test_generate_stream_endpoint_emits_sse(client: TestClient, monkeypatch) -> None:
    h = auth_headers(client, "ai5@example.com")
    client.put("/ai/config", headers=h, json={"provider": "openai", "model": "m", "api_key": "K"})

    async def fake_stream(cfg, prompt, document, lod=None):
        yield {"type": "start", "lod": 0}
        yield {"type": "plan", "object": "box", "count": 1, "names": ["a"]}
        yield {
            "type": "result",
            "operations": [{"action": "add", "type": "SOLID3D", "layer": "a", "props": {"op": "BOX"}}],
            "message": "ok",
        }

    monkeypatch.setattr(ai_pipeline, "generate_stream", fake_stream)
    r = client.post("/ai/generate/stream", headers=h, json={"prompt": "a box", "document": {"entities": []}})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    body = r.text
    assert '"type": "plan"' in body
    assert '"type": "result"' in body


def test_generate_retries_until_operations(monkeypatch) -> None:
    # 1ª respuesta vacía → reintenta → 2ª con operaciones.
    fake = _FakeAgent([AiResult(operations=[], message=""), AiResult(operations=[_CIRCLE], message="ok")])
    monkeypatch.setattr(ai_service, "_build_agent", lambda cfg: fake)
    monkeypatch.setattr(ai_service.asyncio, "sleep", _no_sleep)
    result = asyncio.run(ai_service.generate({"model": "m", "api_key": "k"}, "circle", {"entities": []}))
    assert len(result.operations) == 1
    assert fake.calls == 2


def test_generate_gives_up_after_budget(monkeypatch) -> None:
    # Siempre vacío → agota el presupuesto (reducido) → RuntimeError.
    fake = _FakeAgent([AiResult(operations=[], message="")])
    monkeypatch.setattr(ai_service, "_build_agent", lambda cfg: fake)
    monkeypatch.setattr(ai_service.asyncio, "sleep", _no_sleep)
    monkeypatch.setattr(ai_service, "MAX_TOTAL_SECONDS", 0.05)
    with pytest.raises(RuntimeError):
        asyncio.run(ai_service.generate({"model": "m", "api_key": "k"}, "x", {"entities": []}))


def test_ai_operations_requires_at_least_one() -> None:
    # El schema de salida del LLM prohíbe operaciones vacías (fuerza a enumerar geometría).
    with pytest.raises(ValidationError):
        AiOperations(operations=[])


def test_normalize_wraps_leaf_ops_into_solid3d() -> None:
    # Si el modelo emite el nombre del leaf como `type` (p. ej. "BOX"), se envuelve en SOLID3D
    # y las primitivas curvas reciben `segments` por defecto (incluso anidadas en un booleano).
    ops = AiOperations(
        operations=[
            EntityOp(action="add", type="BOX", props={"origin": [0, 0, 0], "width": 10, "depth": 10, "height": 10}),
            EntityOp(
                action="add",
                type="SOLID3D",
                props={"op": "UNION", "operands": [{"op": "SPHERE", "center": [0, 0, 0], "radius": 5}]},
            ),
        ]
    )
    result = ai_service._normalize(ops)
    assert [o.type for o in result.operations] == ["SOLID3D", "SOLID3D"]
    assert result.operations[0].props["op"] == "BOX"
    assert result.operations[1].props["operands"][0]["segments"] == 48


def test_normalize_accepts_arc_and_defaults_normal() -> None:
    # el ARC es un tipo válido para la IA y, si falta, se le completa la normal.
    ops = AiOperations(
        operations=[
            EntityOp(
                action="add",
                type="ARC",
                props={"center": [0, 0, 0], "radius": 10, "startAngle": 0, "endAngle": 1.5708},
            ),
        ]
    )
    result = ai_service._normalize(ops)
    assert [o.type for o in result.operations] == ["ARC"]
    assert result.operations[0].props["normal"] == [0, 0, 1]
    assert result.operations[0].layer == "0"
