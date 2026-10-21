"""CAD generativo jerárquico.

En lugar de pedir al LLM que planifique y escriba toda la geometría en una sola inferencia
(no escala más allá de objetos de pocas piezas), este pipeline divide el problema en etapas
acotadas, como modela un ingeniero:

  1. Planner        — el pedido → árbol de piezas, cada una con su CAJA delimitadora (mm).
  2. Diseñador      — por cada pieza (en paralelo) → operaciones SOLID3D dentro de su caja.
  3. Compositor     — implícito: las piezas ya vienen en coordenadas de mundo por su caja.
  4. Validador      — AABB en Python: piezas vacías/fuera de escala se regeneran (autorreparación).

Cada llamada al LLM resuelve un problema pequeño, por lo que hasta modelos chicos producen
objetos complejos (decenas–cientos de sólidos) de forma consistente.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from pydantic_ai import Agent, ModelRetry

from app.schemas.ai import AiResult, PartGeometry, ScenePlan
from app.services.ai_service import _build_model, normalize_ops

logger = logging.getLogger("cota.ai")

# LOD → (min_parts, max_parts, max_solids_por_pieza)
LOD_TABLE: dict[int, tuple[int, int, int]] = {
    0: (4, 8, 3),
    1: (8, 20, 6),
    2: (20, 60, 10),
    3: (60, 150, 12),
}
DEFAULT_LOD = 2

MAX_CONCURRENCY = 3  # gentil con rate limits del proveedor (p. ej. NVIDIA free tier → 429)
PART_REPAIR_RETRIES = 2  # reintentos de una pieza inválida (autorreparación de geometría)
REPAIR_BACKOFF = 2.0  # segundos entre reintentos de una pieza por geometría inválida
MAX_TOTAL_SECONDS = 600  # 10 min de presupuesto total

# Reintentos por-consulta (cada llamada al LLM: planner y piezas) con backoff exponencial.
# Ante 429/límite de tasa el backoff arranca más alto (el proveedor pide "más lento").
REQUEST_INITIAL_BACKOFF = 3.0
RATELIMIT_INITIAL_BACKOFF = 15.0
MAX_REQUEST_BACKOFF = 90.0


async def _noop_emit(_ev: dict) -> None:
    """Sumidero de eventos por defecto (sin streaming)."""
    return


def _is_rate_limit(e: Exception) -> bool:
    """True si la excepción es un 429 / límite de tasa (para backoff más agresivo)."""
    if getattr(e, "status_code", None) == 429:
        return True
    s = str(e).lower()
    return "429" in s or "too many requests" in s or "rate limit" in s


def _retry_after_seconds(e: Exception) -> float | None:
    """Intenta leer un header Retry-After de la excepción del proveedor, si existe."""
    resp = getattr(e, "response", None)
    headers = getattr(resp, "headers", None)
    if headers:
        try:
            val = headers.get("retry-after") or headers.get("Retry-After")
            if val is not None:
                return float(val)
        except (TypeError, ValueError):
            return None
    return None


async def _run_with_backoff(agent: Any, msg: str, deadline: float, label: str, emit: Any = _noop_emit) -> Any:
    """Ejecuta `agent.run(msg)` con reintentos y backoff exponencial hasta `deadline`.

    Reintenta ante CUALQUIER error del proveedor (en especial 429/límite de tasa), respetando
    `Retry-After` cuando está disponible. Es la política de reintentos por-consulta del pipeline.
    Emite eventos de reintento (para el log en vivo del frontend).
    """
    delay = REQUEST_INITIAL_BACKOFF
    last: Exception | None = None
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            return await agent.run(msg)
        except Exception as e:  # noqa: BLE001 — se registra y se reintenta con backoff
            last = e
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            rate = _is_rate_limit(e)
            if rate and delay < RATELIMIT_INITIAL_BACKOFF:
                delay = RATELIMIT_INITIAL_BACKOFF
            wait = min(_retry_after_seconds(e) or delay, remaining)
            logger.warning(
                "AI %s attempt=%d failed (%s%s); backoff %.1fs (%.0fs left)",
                label, attempt, "rate-limit " if rate else "", str(e)[:160], wait, remaining,
            )
            await emit({
                "type": "retry", "label": label, "attempt": attempt, "rate": rate,
                "wait": round(wait, 1), "reason": ("rate limit (429)" if rate else "provider error"),
            })
            await asyncio.sleep(wait)
            delay = min(delay * 2, MAX_REQUEST_BACKOFF)
    raise last or RuntimeError(f"AI {label}: exhausted retry budget")


PLANNER_PROMPT = """\
You are an industrial designer. Decompose the user's requested object into concrete PARTS so a CAD
engineer can model each one independently. You do NOT output any CAD geometry here — only the plan.

Rules:
- Think in a hierarchy: object → parts. Give correct PROPORTIONS above all.
- Choose an overall bounding box `bbox` = [width, depth, height] in millimetres (X, Y, Z; Z up).
- For EACH part provide:
  - `name`: short unique name (e.g. "front left wheel").
  - `description`: one line on how it is built (shape/primitives), for the engineer.
  - `origin`: [x, y, z] minimum corner of the part's axis-aligned bounding box, in world mm.
  - `size`: [w, d, h] of that box, in mm.
- Position the part boxes so the parts FIT TOGETHER: no gross overlaps, nothing floating in the air,
  wheels touch the ground (z≈0), symmetric parts mirrored around the center. The boxes tile the object.
- Produce roughly {n_parts} parts (more parts = more detail). Keep it coherent, not a random pile.
- Do NOT ask questions. Pick reasonable real-world dimensions.
"""

PART_PROMPT = """\
You are a CAD engineer. Model ONLY ONE part of a larger object, using drawing OPERATIONS.

Output: a NON-EMPTY `operations` array of "add" operations (there is no free-text field — put the
geometry in operations, never in prose).

Coordinates are WORLD millimetres (X, Y, Z; Z up). Fill APPROXIMATELY the part's assigned box
(origin + size given below). Stay inside/near that box; keep the correct scale.

Use SOLID3D entities. `props` is a solid tree, ONE of these leaves or a boolean of them:
- Box:      {"op":"BOX", "origin":[x,y,z], "width":w, "depth":d, "height":h}   (extends +X,+Y,+Z)
- Cylinder: {"op":"CYLINDER", "base":[x,y,z], "radius":r, "height":h, "segments":48}   (+Z up)
- Cone:     {"op":"CONE", "base":[x,y,z], "radius":r, "height":h, "segments":48}
- Sphere:   {"op":"SPHERE", "center":[x,y,z], "radius":r, "segments":48}
- Extrude:  {"op":"EXTRUDE", "profile":[[x,y,z],...], "height":h}   (closed polygon extruded +Z)
- Prism:    {"op":"PRISM", "center":[x,y,z], "radius":r, "sides":n, "height":h}   (regular n-gon prism, +Z)
- Revolve:  {"op":"REVOLVE", "base":[x,y,z], "profile":[[radius,z],...], "segments":48}   (lathe around the
            vertical axis through base — great for wheels, tyres, bottles, turned/CNC parts, domes)
- Sweep:    {"op":"SWEEP", "profile":[[x,y],...], "path":[[x,y,z],...]}   (2D profile swept along a 3D path
            — pipes, tubes, cables, curved bars)
- Loft:     {"op":"LOFT", "sections":[[[x,y,z],...],[[x,y,z],...],...]}   (blend cross-sections with the
            SAME number of vertices — organic/streamlined bodies, fuselage, nose cones, fairings)
- Shell:    {"op":"SHELL", "solid":<solid>, "thickness":t}   (hollow out a solid, wall thickness t)
- Boolean:  {"op":"UNION"|"SUBTRACT"|"INTERSECT", "operands":[<solid>, <solid>, ...]}
Each op is: {"action":"add", "type":"SOLID3D", "layer":"<part>", "props":<solid tree>}
Prefer REVOLVE for round/turned parts, LOFT/SWEEP for streamlined/organic shapes, over stacking boxes.

Prefer a few well-placed solids over many misplaced ones.
Do NOT ask questions. Do NOT model other parts.
"""


def _clamp_lod(lod: int | None) -> int:
    if lod is None:
        return DEFAULT_LOD
    return max(0, min(3, int(lod)))


def _plan_agent(cfg: dict[str, Any]) -> Agent:
    return Agent(_build_model(cfg), output_type=ScenePlan, retries=3)


def _part_agent(cfg: dict[str, Any]) -> Agent:
    agent = Agent(_build_model(cfg), output_type=PartGeometry, retries=3)

    @agent.output_validator
    def _require_add(result: PartGeometry) -> PartGeometry:
        if not any(o.action == "add" for o in result.operations):
            raise ModelRetry("Empty geometry. Emit the part as concrete 'add' SOLID3D operations now.")
        return result

    return agent


# ---------------------------------------------------------------------------
# Validador: AABB de un árbol de sólido, calculado en Python (sin render).
# ---------------------------------------------------------------------------

_Vec = tuple[float, float, float]


def _merge(a: tuple[_Vec, _Vec] | None, b: tuple[_Vec, _Vec] | None) -> tuple[_Vec, _Vec] | None:
    if a is None:
        return b
    if b is None:
        return a
    (amin, amax), (bmin, bmax) = a, b
    return (
        (min(amin[0], bmin[0]), min(amin[1], bmin[1]), min(amin[2], bmin[2])),
        (max(amax[0], bmax[0]), max(amax[1], bmax[1]), max(amax[2], bmax[2])),
    )


def _num3(v: Any, default: _Vec = (0.0, 0.0, 0.0)) -> _Vec:
    try:
        return (float(v[0]), float(v[1]), float(v[2]))
    except (TypeError, ValueError, IndexError):
        return default


def solid_aabb(props: Any) -> tuple[_Vec, _Vec] | None:
    """AABB [min, max] de un árbol SOLID3D (over-approx para booleanas). None si desconocido/vacío."""
    if not isinstance(props, dict):
        return None
    op = props.get("op")
    if op == "BOX":
        o = _num3(props.get("origin"))
        w, d, h = float(props.get("width", 0)), float(props.get("depth", 0)), float(props.get("height", 0))
        return (o, (o[0] + w, o[1] + d, o[2] + h))
    if op in ("CYLINDER", "CONE"):
        b = _num3(props.get("base"))
        r, h = float(props.get("radius", 0)), float(props.get("height", 0))
        return ((b[0] - r, b[1] - r, b[2]), (b[0] + r, b[1] + r, b[2] + h))
    if op == "SPHERE":
        c = _num3(props.get("center"))
        r = float(props.get("radius", 0))
        return ((c[0] - r, c[1] - r, c[2] - r), (c[0] + r, c[1] + r, c[2] + r))
    if op == "EXTRUDE":
        prof = props.get("profile") or []
        if not prof:
            return None
        xs = [float(p[0]) for p in prof]
        ys = [float(p[1]) for p in prof]
        z0 = float(prof[0][2]) if len(prof[0]) > 2 else 0.0
        h = float(props.get("height", 0))
        return ((min(xs), min(ys), z0), (max(xs), max(ys), z0 + h))
    if op == "PRISM":
        c = _num3(props.get("center"))
        r, h = float(props.get("radius", 0)), float(props.get("height", 0))
        return ((c[0] - r, c[1] - r, c[2]), (c[0] + r, c[1] + r, c[2] + h))
    if op == "REVOLVE":
        b = _num3(props.get("base"))
        prof = props.get("profile") or []
        if not prof:
            return None
        rs = [float(p[0]) for p in prof]
        zs = [float(p[1]) for p in prof]
        r = max(rs) if rs else 0.0
        return ((b[0] - r, b[1] - r, b[2] + min(zs)), (b[0] + r, b[1] + r, b[2] + max(zs)))
    if op == "SWEEP":
        path = props.get("path") or []
        if not path:
            return None
        # Radio del perfil (para engrosar la envolvente del path).
        prof = props.get("profile") or []
        pr = max((abs(float(p[0])) + abs(float(p[1])) for p in prof), default=0.0) if prof else 0.0
        xs = [float(p[0]) for p in path]
        ys = [float(p[1]) for p in path]
        zs = [float(p[2]) if len(p) > 2 else 0.0 for p in path]
        return ((min(xs) - pr, min(ys) - pr, min(zs) - pr), (max(xs) + pr, max(ys) + pr, max(zs) + pr))
    if op == "LOFT":
        acc2: tuple[_Vec, _Vec] | None = None
        for sec in props.get("sections", []) or []:
            for p in sec:
                pt = _num3(p)
                acc2 = _merge(acc2, (pt, pt))
        return acc2
    if op in ("UNION", "SUBTRACT", "INTERSECT"):
        acc: tuple[_Vec, _Vec] | None = None
        for operand in props.get("operands", []) or []:
            acc = _merge(acc, solid_aabb(operand))
        return acc
    if op == "SHELL":
        return solid_aabb(props.get("solid"))
    return None


def ops_aabb(ops: list) -> tuple[_Vec, _Vec] | None:
    acc: tuple[_Vec, _Vec] | None = None
    for op in ops:
        if op.action == "add" and isinstance(op.props, dict):
            acc = _merge(acc, solid_aabb(op.props))
    return acc


def validate_part(part: Any, ops: list) -> str | None:
    """Devuelve un problema si la geometría de la pieza es inválida (para autorreparar), o None."""
    adds = [o for o in ops if o.action == "add"]
    if not adds:
        return "no geometry was produced"
    box = ops_aabb(ops)
    if box is None:
        return "geometry has no measurable size"
    (mn, mx) = box
    size = (mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])
    if max(size) <= 1e-6:
        return "geometry is degenerate (zero size)"
    target = [float(s) for s in (part.size or [10, 10, 10])]
    tmax = max(target) if target else 10.0
    # Fuera de escala: alguna dimensión mucho mayor que su región asignada.
    if tmax > 0 and max(size) > 6 * tmax:
        return f"part is way out of scale (got {max(size):.0f}mm for a ~{tmax:.0f}mm region)"
    return None


# ---------------------------------------------------------------------------
# Etapas del pipeline.
# ---------------------------------------------------------------------------


async def plan_scene(cfg: dict[str, Any], prompt: str, lod: int, deadline: float, emit: Any = _noop_emit) -> ScenePlan:
    _, max_parts, _ = LOD_TABLE[lod]
    agent = _plan_agent(cfg)
    msg = PLANNER_PROMPT.format(n_parts=max_parts) + f"\n\nUser request: {prompt}\nLOD: {lod}"
    run = await _run_with_backoff(agent, msg, deadline, "planner", emit)
    plan: ScenePlan = run.output
    if len(plan.parts) > max_parts:
        plan.parts = plan.parts[:max_parts]  # tope por LOD
    logger.info("AI plan | object=%r | parts=%d | bbox=%s", plan.object or prompt[:40], len(plan.parts), plan.bbox)
    await emit({
        "type": "plan", "object": plan.object or prompt.strip(),
        "count": len(plan.parts), "names": [p.name for p in plan.parts],
    })
    return plan


def _part_message(plan: ScenePlan, part: Any, max_solids: int, correction: str = "") -> str:
    # PART_PROMPT contiene llaves JSON de ejemplo → NO usar str.format (interpretaría los `{...}`).
    ctx = (
        f"\n\nObject: {plan.object} ({plan.category}/{plan.subtype}, {plan.style}). "
        f"This part: '{part.name}' — {part.description}. "
        f"Assigned box: origin={part.origin}, size={part.size} (mm). "
        f"Use up to {max_solids} solids for this part."
    )
    return PART_PROMPT + ctx + correction


async def design_part(cfg: dict[str, Any], plan: ScenePlan, part: Any, max_solids: int, deadline: float, emit: Any = _noop_emit) -> list:
    """Modela una pieza con autorreparación: si la validación falla, regenera con feedback.

    Cada llamada al LLM pasa por `_run_with_backoff` (reintentos por-consulta ante 429/errores);
    el bucle externo reintenta ante geometría inválida (autorreparación).
    """
    agent = _part_agent(cfg)
    await emit({"type": "part_start", "name": part.name})
    correction = ""
    last_problem = ""
    for attempt in range(PART_REPAIR_RETRIES + 1):
        try:
            run = await _run_with_backoff(
                agent, _part_message(plan, part, max_solids, correction), deadline, f"part {part.name!r}", emit
            )
            ops = normalize_ops(run.output.operations, layer=part.name or "0")
            # La capa la fija el pipeline (agrupación por pieza), no lo que el LLM haya puesto.
            for o in ops:
                if o.action == "add":
                    o.layer = part.name or "0"
        except Exception as e:  # noqa: BLE001
            last_problem = str(e)
            logger.warning("AI part %r attempt=%d error: %s", part.name, attempt + 1, e)
            ops = []
        problem = last_problem if not ops else validate_part(part, ops)
        if not problem:
            logger.info("AI part %r OK (attempt %d): %d op(s)", part.name, attempt + 1, len(ops))
            await emit({"type": "part_done", "name": part.name, "solids": len(ops), "ok": True})
            return ops
        last_problem = problem
        correction = (
            f"\n\nIMPORTANT: your previous attempt was rejected because {problem}. "
            f"Produce solids that fill the assigned box origin={part.origin} size={part.size} (mm)."
        )
        logger.warning("AI part %r attempt=%d rejected: %s", part.name, attempt + 1, problem)
        if attempt < PART_REPAIR_RETRIES:
            await emit({"type": "part_retry", "name": part.name, "reason": str(problem)[:120]})
            await asyncio.sleep(REPAIR_BACKOFF * (attempt + 1))  # backoff (suaviza 429)
    logger.error("AI part %r failed after repairs: %s", part.name, last_problem)
    await emit({"type": "part_done", "name": part.name, "solids": 0, "ok": False})
    return []  # se omite la pieza; el resto del objeto se conserva


async def generate(
    cfg: dict[str, Any], prompt: str, document: dict[str, Any], lod: int | None = None, emit: Any = _noop_emit
) -> AiResult:
    """Genera un objeto completo con el pipeline jerárquico (planner + piezas en paralelo + validador)."""
    lod_v = _clamp_lod(lod)
    _, _, max_solids = LOD_TABLE[lod_v]
    start = time.monotonic()
    deadline = start + MAX_TOTAL_SECONDS
    logger.info("AI pipeline start | provider=%s model=%s | lod=%d | prompt=%r",
                cfg.get("provider"), cfg.get("model"), lod_v, prompt[:160])
    await emit({"type": "start", "lod": lod_v, "prompt": prompt.strip()[:120]})

    plan = await plan_scene(cfg, prompt, lod_v, deadline, emit)

    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def _one(part: Any) -> list:
        async with sem:
            if time.monotonic() > deadline:
                return []
            return await design_part(cfg, plan, part, max_solids, deadline, emit)

    per_part = await asyncio.gather(*[_one(p) for p in plan.parts])
    all_ops = [op for ops in per_part for op in ops]

    ok_parts = sum(1 for ops in per_part if ops)
    took = time.monotonic() - start
    logger.info("AI pipeline done | %.1fs | parts %d/%d | solids=%d",
                took, ok_parts, len(plan.parts), len(all_ops))

    if not all_ops:
        raise RuntimeError("The pipeline produced no drawable geometry. Try a simpler prompt or lower LOD.")

    obj = plan.object or prompt.strip()
    message = f"Modeled '{obj}' — {ok_parts} part(s), {len(all_ops)} solid(s) (LOD{lod_v})."
    await emit({"type": "summary", "parts": ok_parts, "total": len(plan.parts),
                "solids": len(all_ops), "seconds": round(took, 1)})
    return AiResult(operations=all_ops, message=message)


async def generate_stream(cfg: dict[str, Any], prompt: str, document: dict[str, Any], lod: int | None = None):
    """Igual que `generate` pero **async generator**: produce eventos de progreso y, al final, el
    evento `result` (con las operaciones) o `error`. Lo consume el endpoint SSE."""
    q: asyncio.Queue = asyncio.Queue()

    async def emit(ev: dict) -> None:
        await q.put(ev)

    async def runner() -> None:
        try:
            res = await generate(cfg, prompt, document, lod, emit)
            await q.put({
                "type": "result",
                "operations": [o.model_dump() for o in res.operations],
                "message": res.message,
            })
        except Exception:
            logger.exception("AI pipeline stream failed")
            await q.put({"type": "error", "message": "AI generation failed. Check the API key and model in AI settings; details are in the server log."})
        finally:
            await q.put(None)  # centinela de fin

    task = asyncio.create_task(runner())
    try:
        while True:
            ev = await q.get()
            if ev is None:
                break
            yield ev
    finally:
        await task
