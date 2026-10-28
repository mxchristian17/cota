from typing import Any

from pydantic import BaseModel, Field


class AgentStepIn(BaseModel):
    """Una llamada al modelo: el system prompt, la conversación (formato neutro) y las herramientas (JSON Schema)."""

    system: str = Field(max_length=40_000)
    messages: list[dict[str, Any]] = Field(max_length=2000)
    tools: list[dict[str, Any]] = Field(default_factory=list, max_length=64)


class ToolCallOut(BaseModel):
    id: str
    name: str
    args: dict[str, Any]


class AgentStepOut(BaseModel):
    text: str
    tool_calls: list[ToolCallOut]
    usage: dict[str, int]


class ConversationIn(BaseModel):
    title: str = Field(default="", max_length=200)
    messages: list[dict[str, Any]] = Field(default_factory=list, max_length=4000)
    context: int = 0


class ConversationOut(ConversationIn):
    id: str
    updated_at: str
