from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class AgentConversation(SQLModel, table=True):
    """Conversación del panel del agente (modo servidor): los mensajes en el formato neutro del frontend."""

    __tablename__ = "agent_conversation"

    user_id: int = Field(primary_key=True, foreign_key="user.id")
    id: str = Field(primary_key=True, max_length=64)
    title: str = Field(default="", max_length=200)
    messages: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    context: int = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
