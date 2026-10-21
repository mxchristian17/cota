from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class UserConfig(SQLModel, table=True):
    user_id: int = Field(primary_key=True, foreign_key="user.id")
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
