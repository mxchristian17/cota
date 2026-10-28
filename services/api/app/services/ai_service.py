"""Generación/edición del modelo Cota con un LLM vía PydanticAI.

El agente devuelve una salida **estructurada** (`AiResult`): una lista de operaciones
add/delete/update sobre entidades, que el cliente previsualiza y acepta o descarta.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from pydantic_ai import Agent, ModelRetry
from pydantic_ai.providers.openai import OpenAIProvider

from app.schemas.ai import AiOperations, AiResult

logger = logging.getLogger("cota.ai")

# Presupuesto total de reintentos con backoff para generar un modelo.
MAX_TOTAL_SECONDS = 300  # 5 minutos
INITIAL_BACKOFF = 2.0
MAX_BACKOFF = 30.0

# --- Prompt base: describe TODO lo que el LLM puede hacer para generar el modelo ---

SYSTEM_PROMPT = """\
You are a CAD modeling engine embedded in Cota (a web classic CAD-like app). Your ONLY job is to translate
the user's request into concrete drawing OPERATIONS that the app applies to the current drawing.

CRITICAL RULES — follow them exactly:
- Your ONLY output is a NON-EMPTY `operations` array. There is NO free-text/message field: you cannot
  answer with prose. If you feel like describing the object in words, STOP and emit those parts as
  operations instead. An empty `operations` array is rejected and you will be asked again.
- Decompose complex objects (furniture, machines, buildings) into primitive parts and emit ONE "add"
  operation per part (a chair = seat + backrest + 4 legs = 6 adds). Never collapse an object into prose.
- Do NOT ask questions or request clarification. If a size/position is unspecified, PICK reasonable
  values (e.g. default sizes 10–100 mm, place near the origin) and proceed.
- Output ONLY valid entities from the list below, with EXACTLY the given prop keys. Numbers only (mm).
- Units are millimetres; coordinates are 3D arrays [x, y, z], right-handed, Z up.

Each operation:
- action: "add" | "delete" | "update"
- "add":    requires `type`, `layer` (use "0"), and `props`
- "delete": requires `id` (an existing entity id from the current document)
- "update": requires `id` and the new `props`

Entity `type` and required `props` (use these EXACT keys):
- LINE:      {"start":[x,y,z], "end":[x,y,z]}
- CIRCLE:    {"center":[x,y,z], "radius":r, "normal":[0,0,1]}
- ARC:       {"center":[x,y,z], "radius":r, "startAngle":a0, "endAngle":a1, "normal":[0,0,1]}
             (angles in RADIANS; the arc goes from startAngle to endAngle COUNTERCLOCKWISE)
- RECTANGLE: {"corner":[x,y,z], "width":w, "height":h}   (axis-aligned, in XY at corner.z)
- POLYLINE:  {"vertices":[[x,y,z],...], "closed":true|false}
- SPLINE:    {"controlPoints":[[x,y,z],...], "degree":3}
- SOLID3D:   props is a SOLID TREE (see below) — use this for any 3D shape

SOLID3D `props` is ONE of these parametric leaves (preferred for 3D; they render smooth):
- Box:      {"op":"BOX", "origin":[x,y,z], "width":w, "depth":d, "height":h}   (extends +X,+Y,+Z)
- Cylinder: {"op":"CYLINDER", "base":[x,y,z], "radius":r, "height":h, "segments":48}  (+Z up)
- Cone:     {"op":"CONE", "base":[x,y,z], "radius":r, "height":h, "segments":48}
- Sphere:   {"op":"SPHERE", "center":[x,y,z], "radius":r, "segments":48}
- Extrude:  {"op":"EXTRUDE", "profile":[[x,y,z],...], "height":h}  (extrude a closed polygon along +Z)
Or a boolean combining solids:
- {"op":"UNION"|"SUBTRACT"|"INTERSECT", "operands":[<solid props>, <solid props>, ...]}
  (SUBTRACT removes operands 2..N from operand 1.)

For edits: use "update" with an id from the current document (given below); to remove, "delete" that id.

EXAMPLES (input -> operations):
- "draw a 100x50 rectangle at the origin" ->
  [{"action":"add","type":"RECTANGLE","layer":"0","props":{"corner":[0,0,0],"width":100,"height":50}}]
- "make a cylinder radius 20 height 60 at (200,0,0)" ->
  [{"action":"add","type":"SOLID3D","layer":"0","props":{"op":"CYLINDER","base":[200,0,0],"radius":20,"height":60,"segments":48}}]
- "a box with a cylindrical hole" ->
  [{"action":"add","type":"SOLID3D","layer":"0","props":{"op":"SUBTRACT","operands":[
      {"op":"BOX","origin":[0,0,0],"width":80,"depth":80,"height":40},
      {"op":"CYLINDER","base":[40,40,-1],"radius":15,"height":42,"segments":48}]}}]
- "a table" (legs + top) -> add 4 CYLINDER/BOX legs and 1 BOX top (5 add operations).
- "model a chair in 3D" -> seat + backrest + 4 legs = 6 add operations:
  [{"action":"add","type":"SOLID3D","layer":"0","props":{"op":"BOX","origin":[0,0,450],"width":450,"depth":450,"height":40}},
   {"action":"add","type":"SOLID3D","layer":"0","props":{"op":"BOX","origin":[0,410,490],"width":450,"depth":40,"height":410}},
   {"action":"add","type":"SOLID3D","layer":"0","props":{"op":"BOX","origin":[0,0,0],"width":40,"depth":40,"height":450}},
   {"action":"add","type":"SOLID3D","layer":"0","props":{"op":"BOX","origin":[410,0,0],"width":40,"depth":40,"height":450}},
   {"action":"add","type":"SOLID3D","layer":"0","props":{"op":"BOX","origin":[0,410,0],"width":40,"depth":40,"height":450}},
   {"action":"add","type":"SOLID3D","layer":"0","props":{"op":"BOX","origin":[410,410,0],"width":40,"depth":40,"height":450}}]
"""


def _document_context(document: dict[str, Any]) -> str:
    """Resumen compacto del documento actual (ids + tipos + props) como contexto."""
    ents = document.get("entities", []) if isinstance(document, dict) else []
    layers = [l.get("name") for l in document.get("layers", [])] if isinstance(document, dict) else []
    summary = [{"id": e.get("id"), "type": e.get("type"), "props": e.get("props")} for e in ents][:200]
    return (
        f"Current document has {len(ents)} entities. Layers: {layers}.\n"
        f"Entities (id/type/props): {json.dumps(summary)[:6000]}"
    )


def _build_model(cfg: dict[str, Any]) -> Any:
    """Construye el modelo de pydantic-ai según el proveedor (openai-compatible o google)."""
    provider = cfg.get("provider", "openai")
    model_name = cfg["model"]
    api_key = cfg["api_key"]

    if provider == "anthropic":
        # Requiere el extra [anthropic] de pydantic-ai.
        from pydantic_ai.models.anthropic import AnthropicModel  # type: ignore
        from pydantic_ai.providers.anthropic import AnthropicProvider  # type: ignore

        return AnthropicModel(model_name, provider=AnthropicProvider(api_key=api_key))

    if provider == "google":
        # Requiere el extra [google] de pydantic-ai (google-genai).
        from pydantic_ai.models.google import GoogleModel  # type: ignore
        from pydantic_ai.providers.google import GoogleProvider  # type: ignore

        return GoogleModel(model_name, provider=GoogleProvider(api_key=api_key))

    try:
        from pydantic_ai.models.openai import OpenAIChatModel as OpenAIModel  # type: ignore
    except ImportError:  # versiones previas
        from pydantic_ai.models.openai import OpenAIModel  # type: ignore

    base = cfg.get("api_base") or None
    prov = OpenAIProvider(base_url=base, api_key=api_key) if base else OpenAIProvider(api_key=api_key)
    return OpenAIModel(model_name, provider=prov)


def _build_agent(cfg: dict[str, Any]) -> Agent:
    agent = Agent(_build_model(cfg), output_type=AiOperations, system_prompt=SYSTEM_PROMPT, retries=3)

    @agent.output_validator
    def _require_add(result: AiOperations) -> AiOperations:
        # Refuerza inline (pydantic-ai re-prompta con este mensaje) que haya geometría dibujable.
        if not any(o.action == "add" for o in result.operations):
            raise ModelRetry(
                "No 'add' operations. Emit every part as a concrete 'add' SOLID3D/2D operation now."
            )
        return result

    return agent


_ADD_TYPES = {"LINE", "CIRCLE", "ARC", "POLYLINE", "RECTANGLE", "SPLINE", "SOLID3D", "MESH3D"}
_CURVED = {"CYLINDER", "CONE", "SPHERE", "REVOLVE"}  # llevan `segments` (teselación)
_SOLID_LEAF_OPS = {
    "BOX", "CYLINDER", "CONE", "SPHERE", "EXTRUDE",
    "PRISM", "REVOLVE", "SWEEP", "LOFT", "SHELL",  # geometría avanzada (Fase 2)
    "UNION", "SUBTRACT", "INTERSECT",
}


def _fix_segments(node: Any) -> None:
    """Añade `segments` por defecto a las primitivas curvas dentro del árbol SOLID3D."""
    if not isinstance(node, dict):
        return
    if node.get("op") in _CURVED:
        node.setdefault("segments", 48)
    for operand in node.get("operands", []) or []:
        _fix_segments(operand)
    _fix_segments(node.get("solid"))  # SHELL envuelve un sólido en `solid`


def normalize_ops(operations: list, layer: str | None = None) -> list:
    """Filtra/completa una lista de EntityOp para que sean dibujables.

    Si se pasa `layer`, se usa como capa por defecto de los `add` (el pipeline agrupa por pieza).
    """
    ops = []
    for op in operations:
        if op.action == "add":
            if not isinstance(op.props, dict):
                continue
            props = dict(op.props)
            etype = op.type
            # Tolerancia: si el modelo emitió el nombre del leaf como `type` (p. ej. "BOX"),
            # lo envolvemos en SOLID3D moviendo el op al interior de props.
            if etype in _SOLID_LEAF_OPS:
                props.setdefault("op", etype)
                etype = "SOLID3D"
            if etype not in _ADD_TYPES:
                continue
            if etype in ("CIRCLE", "ARC"):
                props.setdefault("normal", [0, 0, 1])
            if etype == "SOLID3D":
                _fix_segments(props)
            op.type = etype
            op.props = props
            op.layer = op.layer or layer or "0"
            ops.append(op)
        elif op.action in ("delete", "update") and op.id:
            ops.append(op)
    return ops


def _normalize(result: AiOperations) -> AiResult:
    """Filtra/completa las operaciones para garantizar que sean dibujables."""
    ops = normalize_ops(result.operations)
    n_add = sum(1 for o in ops if o.action == "add")
    message = f"Generated {len(ops)} operation(s)" + (f" ({n_add} new)." if n_add else ".")
    return AiResult(operations=ops, message=message)


async def generate(cfg: dict[str, Any], prompt: str, document: dict[str, Any]) -> AiResult:
    """
    Ejecuta el agente con **reintentos y backoff exponencial hasta 5 minutos** y devuelve las
    operaciones propuestas (normalizadas). Reintenta ante errores del proveedor y también si el
    modelo devolvió una respuesta sin operaciones dibujables. Loguea el progreso en `cota.ai`.
    """
    agent = _build_agent(cfg)
    context = _document_context(document)
    n_ents = len(document.get("entities", [])) if isinstance(document, dict) else 0
    base_msg = f"{context}\n\nUser request: {prompt}"

    logger.info(
        "AI generate | provider=%s model=%s | doc_entities=%d",
        cfg.get("provider"), cfg.get("model"), n_ents,
    )

    start = time.monotonic()
    deadline = start + MAX_TOTAL_SECONDS
    delay = INITIAL_BACKOFF
    attempt = 0
    strict = ""
    last_error: str | None = None

    while time.monotonic() < deadline:
        attempt += 1
        t0 = time.monotonic()
        try:
            run = await agent.run(base_msg + strict)
            result = _normalize(run.output)
            took = time.monotonic() - t0
            if result.operations:
                logger.info(
                    "AI generate OK | attempt=%d | %.1fs | ops=%d | msg=%r",
                    attempt, took, len(result.operations), result.message[:120],
                )
                return result
            # Respuesta sin operaciones: reintento estricto.
            last_error = "no drawable operations"
            strict = (
                "\n\nIMPORTANT: your previous answer had NO operations. You MUST now express the "
                "geometry as concrete `operations` (add/delete/update). Return at least one 'add'."
            )
            logger.warning("AI generate attempt=%d returned no operations (%.1fs); retrying strict.", attempt, took)
        except Exception as e:  # noqa: BLE001 — se registra y se reintenta
            last_error = str(e)
            logger.warning("AI generate attempt=%d failed (%.1fs): %s", attempt, time.monotonic() - t0, e)

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        sleep_for = min(delay, remaining)
        logger.info("AI generate | backoff %.1fs before attempt %d (%.0fs of 5min used)", sleep_for, attempt + 1, time.monotonic() - start)
        await asyncio.sleep(sleep_for)
        delay = min(delay * 2, MAX_BACKOFF)

    logger.error("AI generate exhausted 5 min after %d attempts. last_error=%s", attempt, last_error)
    raise RuntimeError(f"AI generation failed after {attempt} attempts within 5 minutes: {last_error}")
