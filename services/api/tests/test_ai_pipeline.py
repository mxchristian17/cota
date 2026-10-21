"""Tests del pipeline jerárquico de CAD generativo. No llama al LLM real."""

import asyncio

from app.schemas.ai import EntityOp, PartGeometry, PartPlan, ScenePlan
from app.services import ai_pipeline


class _FakeRun:
    def __init__(self, output):
        self.output = output


class _FakeAgent:
    """Agente que devuelve salidas por llamada (para probar autorreparación)."""

    def __init__(self, outputs):
        self._outputs = outputs
        self.calls = 0

    def output_validator(self, fn):  # el pipeline registra un validador; lo ignoramos aquí
        return fn

    async def run(self, _msg):
        out = self._outputs[min(self.calls, len(self._outputs) - 1)]
        self.calls += 1
        # Copia profunda: cada llamada real del LLM devuelve objetos nuevos (evita aliasing).
        return _FakeRun(out.model_copy(deep=True))


class _RateLimitError(Exception):
    status_code = 429

    def __str__(self):
        return "status_code: 429, body: {'status': 429, 'title': 'Too Many Requests'}"


class _FlakyAgent:
    """Lanza `fails` veces (rate limit) y luego devuelve `output`."""

    def __init__(self, output, fails):
        self._output = output
        self.fails = fails
        self.calls = 0

    def output_validator(self, fn):
        return fn

    async def run(self, _msg):
        self.calls += 1
        if self.calls <= self.fails:
            raise _RateLimitError()
        return _FakeRun(self._output.model_copy(deep=True))


async def _no_sleep(_s):
    return None


def _box_op(origin, size, layer="p"):
    return EntityOp(
        action="add",
        type="SOLID3D",
        layer=layer,
        props={"op": "BOX", "origin": origin, "width": size[0], "depth": size[1], "height": size[2]},
    )


# --- AABB / validador ------------------------------------------------------


def test_solid_aabb_primitives():
    assert ai_pipeline.solid_aabb({"op": "BOX", "origin": [1, 2, 3], "width": 10, "depth": 20, "height": 5}) == (
        (1.0, 2.0, 3.0),
        (11.0, 22.0, 8.0),
    )
    assert ai_pipeline.solid_aabb({"op": "SPHERE", "center": [0, 0, 0], "radius": 4}) == (
        (-4.0, -4.0, -4.0),
        (4.0, 4.0, 4.0),
    )
    # Unión: over-approx = envolvente de los operandos
    u = ai_pipeline.solid_aabb(
        {"op": "UNION", "operands": [
            {"op": "BOX", "origin": [0, 0, 0], "width": 1, "depth": 1, "height": 1},
            {"op": "BOX", "origin": [5, 5, 5], "width": 1, "depth": 1, "height": 1},
        ]}
    )
    assert u == ((0.0, 0.0, 0.0), (6.0, 6.0, 6.0))


def test_solid_aabb_advanced_ops():
    assert ai_pipeline.solid_aabb({"op": "PRISM", "center": [0, 0, 5], "radius": 3, "sides": 6, "height": 10}) == (
        (-3.0, -3.0, 5.0),
        (3.0, 3.0, 15.0),
    )
    # REVOLVE: radio = max(r), rango z = base_z + [min z, max z] del perfil
    assert ai_pipeline.solid_aabb(
        {"op": "REVOLVE", "base": [0, 0, 0], "profile": [[2, 0], [5, 4], [0, 8]], "segments": 48}
    ) == ((-5.0, -5.0, 0.0), (5.0, 5.0, 8.0))
    # LOFT: envolvente de todos los puntos de todas las secciones
    loft = ai_pipeline.solid_aabb(
        {"op": "LOFT", "sections": [[[0, 0, 0], [1, 0, 0]], [[0, 0, 10], [2, 2, 10]]]}
    )
    assert loft == ((0.0, 0.0, 0.0), (2.0, 2.0, 10.0))
    # SHELL: AABB del sólido interior
    assert ai_pipeline.solid_aabb(
        {"op": "SHELL", "solid": {"op": "BOX", "origin": [0, 0, 0], "width": 4, "depth": 4, "height": 4}, "thickness": 1}
    ) == ((0.0, 0.0, 0.0), (4.0, 4.0, 4.0))


def test_validate_part_flags_empty_and_scale():
    part = PartPlan(name="p", origin=[0, 0, 0], size=[10, 10, 10])
    assert ai_pipeline.validate_part(part, []) is not None  # sin geometría
    assert ai_pipeline.validate_part(part, [_box_op([0, 0, 0], [10, 10, 10])]) is None  # OK
    # 100mm para una región de 10mm → fuera de escala
    assert ai_pipeline.validate_part(part, [_box_op([0, 0, 0], [100, 100, 100])]) is not None


# --- Pipeline end-to-end (mock) -------------------------------------------


def _patch(monkeypatch, plan, part_outputs):
    monkeypatch.setattr(ai_pipeline, "_plan_agent", lambda cfg: _FakeAgent([plan]))
    monkeypatch.setattr(ai_pipeline, "_part_agent", lambda cfg: _FakeAgent(part_outputs))


def test_pipeline_builds_parts_with_layers(monkeypatch):
    plan = ScenePlan(
        object="table",
        bbox=[100, 100, 40],
        parts=[
            PartPlan(name="top", origin=[0, 0, 30], size=[100, 100, 10]),
            PartPlan(name="leg", origin=[0, 0, 0], size=[10, 10, 30]),
        ],
    )
    # Cada pieza (comparten el fake) devuelve una caja que llena su región asignada.
    part_out = PartGeometry(operations=[_box_op([0, 0, 0], [10, 10, 10])])
    _patch(monkeypatch, plan, [part_out])

    result = asyncio.run(ai_pipeline.generate({"model": "m", "api_key": "k"}, "a table", {"entities": []}, lod=1))
    assert len(result.operations) == 2
    layers = {o.layer for o in result.operations}
    assert layers == {"top", "leg"}  # capa por pieza
    assert "table" in result.message


def test_pipeline_repairs_bad_part(monkeypatch):
    plan = ScenePlan(object="thing", bbox=[10, 10, 10], parts=[PartPlan(name="a", origin=[0, 0, 0], size=[10, 10, 10])])
    # 1ª salida vacía (rechazada) → 2ª válida (autorreparación).
    outs = [PartGeometry(operations=[EntityOp(action="delete", id="zzz")]), PartGeometry(operations=[_box_op([0, 0, 0], [10, 10, 10])])]
    _patch(monkeypatch, plan, outs)

    async def _no_sleep(_s):
        return None

    monkeypatch.setattr(ai_pipeline.asyncio, "sleep", _no_sleep)
    result = asyncio.run(ai_pipeline.generate({"model": "m", "api_key": "k"}, "thing", {"entities": []}, lod=0))
    assert len(result.operations) == 1
    assert result.operations[0].props["op"] == "BOX"


def test_lod_clamps():
    assert ai_pipeline._clamp_lod(None) == ai_pipeline.DEFAULT_LOD
    assert ai_pipeline._clamp_lod(9) == 3
    assert ai_pipeline._clamp_lod(-5) == 0


def test_is_rate_limit_detects_429():
    assert ai_pipeline._is_rate_limit(_RateLimitError()) is True
    assert ai_pipeline._is_rate_limit(Exception("boom")) is False
    assert ai_pipeline._is_rate_limit(Exception("Error 429 Too Many Requests")) is True


def test_run_with_backoff_retries_on_rate_limit(monkeypatch):
    monkeypatch.setattr(ai_pipeline.asyncio, "sleep", _no_sleep)
    out = PartGeometry(operations=[_box_op([0, 0, 0], [10, 10, 10])])
    agent = _FlakyAgent(out, fails=3)  # 3 x 429 → luego OK
    import time as _t

    deadline = _t.monotonic() + 1000
    run = asyncio.run(ai_pipeline._run_with_backoff(agent, "msg", deadline, "test"))
    assert run.output.operations[0].props["op"] == "BOX"
    assert agent.calls == 4  # 3 fallos + 1 éxito


def test_generate_stream_emits_progress_events(monkeypatch):
    plan = ScenePlan(object="box", bbox=[10, 10, 10], parts=[PartPlan(name="a", origin=[0, 0, 0], size=[10, 10, 10])])
    _patch(monkeypatch, plan, [PartGeometry(operations=[_box_op([0, 0, 0], [10, 10, 10])])])

    async def collect():
        evs = []
        async for ev in ai_pipeline.generate_stream({"model": "m", "api_key": "k"}, "a box", {"entities": []}, lod=0):
            evs.append(ev)
        return evs

    evs = asyncio.run(collect())
    types = [e["type"] for e in evs]
    assert "start" in types and "plan" in types and "part_done" in types and "result" in types
    result = next(e for e in evs if e["type"] == "result")
    assert result["operations"][0]["props"]["op"] == "BOX"


def test_pipeline_recovers_from_planner_rate_limit(monkeypatch):
    monkeypatch.setattr(ai_pipeline.asyncio, "sleep", _no_sleep)
    plan = ScenePlan(object="cube", bbox=[10, 10, 10], parts=[PartPlan(name="a", origin=[0, 0, 0], size=[10, 10, 10])])
    # El planner falla 2 veces con 429 y luego devuelve el plan → el pipeline se recupera.
    monkeypatch.setattr(ai_pipeline, "_plan_agent", lambda cfg: _FlakyAgent(plan, fails=2))
    monkeypatch.setattr(ai_pipeline, "_part_agent", lambda cfg: _FakeAgent([PartGeometry(operations=[_box_op([0, 0, 0], [10, 10, 10])])]))
    result = asyncio.run(ai_pipeline.generate({"model": "m", "api_key": "k"}, "a cube", {"entities": []}, lod=0))
    assert len(result.operations) == 1
