import json
from typing import Any

from pydantic import BaseModel, Field, field_validator

MAX_CONFIG_BYTES = 256 * 1024


class ConfigIn(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("data")
    @classmethod
    def limit_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, separators=(",", ":"))) > MAX_CONFIG_BYTES:
            raise ValueError("Settings exceed the size limit")
        return value


class ConfigOut(BaseModel):
    data: dict[str, Any]
