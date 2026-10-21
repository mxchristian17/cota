import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import get_settings


class DocumentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    folder: str = Field(default="", max_length=500)
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "folder")
    @classmethod
    def no_control_characters(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned and value != "":
            raise ValueError("must not be blank")
        if any(ord(char) < 32 for char in cleaned):
            raise ValueError("must not contain control characters")
        return cleaned

    @field_validator("data")
    @classmethod
    def limit_document_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            size = len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
        except (TypeError, ValueError) as exc:
            raise ValueError("must be JSON serializable") from exc
        if size > get_settings().max_document_bytes:
            raise ValueError("document exceeds the configured size limit")
        return value


class DocumentOut(BaseModel):
    id: str
    name: str
    folder: str = ""
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DocumentSummary(BaseModel):
    id: str
    name: str
    folder: str = ""
    updated_at: datetime
