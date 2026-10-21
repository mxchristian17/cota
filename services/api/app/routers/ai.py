import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.core.deps import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.ai import AiConfigIn, AiConfigOut, AiGenerateIn, AiGenerateOut
from app.services import ai_pipeline, ai_service, config_service

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger("cota.ai")

CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_session)]


@router.get("/config", response_model=AiConfigOut)
def get_ai_config(user: CurrentUser, session: DbSession) -> AiConfigOut:
    ai = config_service.get_ai(session, user.id)
    return AiConfigOut(
        provider=ai.get("provider", "openai"),
        api_base=ai.get("api_base"),
        model=ai.get("model", ""),
        has_key=bool(ai.get("api_key")),
    )


@router.put("/config", response_model=AiConfigOut)
def put_ai_config(body: AiConfigIn, user: CurrentUser, session: DbSession) -> AiConfigOut:
    try:
        config_service.validate_ai_base_url(body.api_base)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    config_service.set_ai(
        session,
        user.id,
        {"provider": body.provider, "api_base": body.api_base, "model": body.model, "api_key": body.api_key},
    )
    return AiConfigOut(provider=body.provider, api_base=body.api_base, model=body.model, has_key=True)


@router.post("/generate", response_model=AiGenerateOut)
async def ai_generate(body: AiGenerateIn, user: CurrentUser, session: DbSession) -> AiGenerateOut:
    ai = config_service.get_ai(session, user.id)
    if not ai.get("api_key"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No AI provider configured. Set it with PROMPT first.")
    entities = body.document.get("entities", []) if isinstance(body.document, dict) else []
    try:
        if entities:
            # Documento con contenido: edición/adición puntual → generación de un solo paso.
            result = await ai_service.generate(ai, body.prompt, body.document)
        else:
            # Documento vacío: creación desde cero → pipeline jerárquico (objetos complejos).
            result = await ai_pipeline.generate(ai, body.prompt, body.document, body.lod)
    except Exception:  # noqa: BLE001 — los detalles del proveedor nunca vuelven al cliente
        logger.error("AI generation failed for user_id=%s", user.id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "AI generation failed") from None
    return AiGenerateOut(operations=result.operations, message=result.message)


def _sse(ev: dict) -> str:
    return f"data: {json.dumps(ev)}\n\n"


@router.post("/generate/stream")
async def ai_generate_stream(body: AiGenerateIn, user: CurrentUser, session: DbSession) -> StreamingResponse:
    """Igual que /ai/generate pero con **progreso en vivo** vía SSE (eventos del pipeline)."""
    ai = config_service.get_ai(session, user.id)
    if not ai.get("api_key"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No AI provider configured. Set it with PROMPT first.")
    entities = body.document.get("entities", []) if isinstance(body.document, dict) else []

    async def event_source():
        try:
            if entities:
                # Documento con contenido: edición de un paso (sin pipeline). Emite start + result.
                yield _sse({"type": "start", "mode": "edit"})
                res = await ai_service.generate(ai, body.prompt, body.document)
                yield _sse({
                    "type": "result",
                    "operations": [o.model_dump() for o in res.operations],
                    "message": res.message,
                })
            else:
                async for ev in ai_pipeline.generate_stream(ai, body.prompt, body.document, body.lod):
                    yield _sse(ev)
        except Exception:  # noqa: BLE001
            logger.error("AI streaming generation failed for user_id=%s", user.id)
            yield _sse({"type": "error", "message": "AI generation failed"})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
