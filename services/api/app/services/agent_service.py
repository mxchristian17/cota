"""Agente de modelado en modo servidor (Docker).

El ciclo de herramientas lo maneja el navegador (las herramientas actúan sobre el dibujo abierto); el servidor hace
cada llamada al modelo con pydantic-ai y la key guardada del usuario, que nunca viaja al navegador. Los mensajes
llegan en el formato neutro del frontend (`user` / `assistant` con tool calls / `tool` con resultados).
"""

from __future__ import annotations

import base64
from typing import Any

from pydantic_ai import direct
from pydantic_ai.messages import (
    BinaryContent,
    ModelMessage,
    ModelMessagesTypeAdapter,
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models import ModelRequestParameters
from pydantic_ai.tools import ToolDefinition

from app.services.ai_service import _build_model


def _image(data_url: str) -> BinaryContent | None:
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        return None
    try:
        return BinaryContent(data=base64.b64decode(data_url[len(prefix) :]), media_type="image/png")
    except ValueError:
        return None


def to_model_messages(system: str, messages: list[dict[str, Any]]) -> list[ModelMessage]:
    """Formato neutro → mensajes de pydantic-ai."""
    out: list[ModelMessage] = []
    first = True
    for m in messages:
        role = m.get("role")
        if role == "user":
            parts: list[Any] = [UserPromptPart(content=str(m.get("text", "")))]
            if first:
                parts.insert(0, SystemPromptPart(content=system))
            out.append(ModelRequest(parts=parts))
            first = False
        elif role == "assistant" and m.get("raw"):
            # La respuesta tal como la devolvió el modelo (con firmas de razonamiento, ids…): vuelve intacta.
            try:
                out.extend(ModelMessagesTypeAdapter.validate_python(m["raw"]))
                continue
            except ValueError:
                pass
            out.append(_plain_response(m))
        elif role == "assistant":
            out.append(_plain_response(m))
        elif role == "tool":

            tparts: list[Any] = []
            images: list[BinaryContent] = []
            for r in m.get("results", []):
                text = str(r.get("text", ""))
                tparts.append(ToolReturnPart(tool_name=r["name"], content=f"ERROR: {text}" if r.get("isError") else text, tool_call_id=r["id"]))
                img = _image(str(r.get("image") or ""))
                if img:
                    images.append(img)
            if images:
                tparts.append(UserPromptPart(content=["Image of the active view:", *images]))
            out.append(ModelRequest(parts=tparts))
    return out


def _plain_response(m: dict[str, Any]) -> ModelResponse:
    parts: list[Any] = []
    if m.get("text"):
        parts.append(TextPart(content=str(m["text"])))
    for c in m.get("toolCalls", []):
        parts.append(ToolCallPart(tool_name=c["name"], args=c.get("args") or {}, tool_call_id=c["id"]))
    return ModelResponse(parts=parts)


def tool_definitions(tools: list[dict[str, Any]]) -> list[ToolDefinition]:
    return [
        ToolDefinition(name=t["name"], description=t.get("description"), parameters_json_schema=t.get("parameters") or {"type": "object", "properties": {}})
        for t in tools
    ]


async def step(cfg: dict[str, Any], system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> dict[str, Any]:
    """Una llamada al modelo; devuelve texto, pedidos de herramientas y tokens."""
    model = _build_model(cfg)
    params = ModelRequestParameters(function_tools=tool_definitions(tools), allow_text_output=True)
    resp = await direct.model_request(model, to_model_messages(system, messages), model_request_parameters=params)
    text = "\n".join(p.content for p in resp.parts if isinstance(p, TextPart))
    calls = [{"id": p.tool_call_id, "name": p.tool_name, "args": p.args_as_dict()} for p in resp.parts if isinstance(p, ToolCallPart)]
    usage = resp.usage
    raw = ModelMessagesTypeAdapter.dump_python([resp], mode="json")
    return {"text": text, "tool_calls": calls, "usage": {"input": int(usage.input_tokens or 0), "output": int(usage.output_tokens or 0)}, "raw": raw}
