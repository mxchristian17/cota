from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Document(SQLModel, table=True):
    id: str = Field(primary_key=True)
    owner_id: int = Field(index=True, foreign_key="user.id")
    name: str
    # Carpeta de proyecto (ruta con "/" para subcarpetas); "" = raíz.
    folder: str = Field(default="", index=True)
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
