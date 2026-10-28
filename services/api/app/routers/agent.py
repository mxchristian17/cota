import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.deps import get_current_user
from app.db.session import get_session
from app.models.agent_conversation import AgentConversation
from app.models.user import User
from app.schemas.agent import AgentStepIn, AgentStepOut, ConversationIn, ConversationOut
from app.services import agent_service, config_service

router = APIRouter(prefix="/agent", tags=["agent"])
logger = logging.getLogger("cota.agent")

CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_session)]


@router.post("/step", response_model=AgentStepOut)
async def agent_step(body: AgentStepIn, user: CurrentUser, session: DbSession) -> AgentStepOut:
    """Una vuelta del agente con la key del usuario guardada en el servidor."""
    ai = config_service.get_ai(session, user.id)
    if not ai.get("api_key") or not ai.get("model"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No AI provider configured on the server.")
    try:
        out = await agent_service.step(ai, body.system, body.messages, body.tools)
    except Exception:  # noqa: BLE001 — los detalles del proveedor nunca vuelven al cliente
        logger.error("Agent step failed for user_id=%s", user.id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI provider did not answer.") from None
    return AgentStepOut(**out)


def _out(c: AgentConversation) -> ConversationOut:
    return ConversationOut(id=c.id, title=c.title, messages=c.messages or [], context=c.context, updated_at=c.updated_at.isoformat())


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(user: CurrentUser, session: DbSession) -> list[ConversationOut]:
    rows = session.exec(select(AgentConversation).where(AgentConversation.user_id == user.id).order_by(AgentConversation.updated_at.desc())).all()  # type: ignore[attr-defined]
    return [_out(c) for c in rows]


@router.put("/conversations/{conv_id}", response_model=ConversationOut)
def put_conversation(conv_id: str, body: ConversationIn, user: CurrentUser, session: DbSession) -> ConversationOut:
    if not conv_id or len(conv_id) > 64:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid conversation id.")
    c = session.get(AgentConversation, (user.id, conv_id))
    if c is None:
        c = AgentConversation(user_id=user.id, id=conv_id)
    c.title, c.messages, c.context, c.updated_at = body.title, body.messages, body.context, datetime.now(UTC)
    session.add(c)
    session.commit()
    session.refresh(c)
    return _out(c)
