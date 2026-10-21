import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Tope del documento de contexto enviado al LLM (bytes de JSON serializado). Evita que un payload
# gigante consuma memoria/CPU de la función serverless. Independiente de max_document_bytes (persistencia).
_MAX_AI_DOCUMENT_BYTES = 4 * 1024 * 1024


class AiConfigIn(BaseModel):
    """Configuración del proveedor LLM del usuario (se guarda por usuario)."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["openai", "google"] = "openai"
    api_base: str | None = None  # p.ej. https://integrate.api.nvidia.com/v1 (NVIDIA, openai-compatible)
    model: str = Field(min_length=1, max_length=200)
    api_key: str = Field(min_length=1, max_length=512)


class AiConfigOut(BaseModel):
    """Config del LLM SIN la clave (nunca se devuelve la key al cliente)."""

    provider: str
    api_base: str | None = None
    model: str
    has_key: bool


class EntityOp(BaseModel):
    """Operación sobre el modelo propuesta por el LLM."""

    action: Literal["add", "delete", "update"]
    id: str | None = None  # requerido para delete/update
    type: str | None = None  # requerido para add (LINE, CIRCLE, SOLID3D, …)
    layer: str = "0"
    props: dict[str, Any] | None = None  # props de la entidad (según el tipo)


class AiOperations(BaseModel):
    """Salida del LLM: SOLO la lista de operaciones (obligatoriamente no vacía).

    Deliberadamente NO tiene un campo `message`: algunos modelos (p. ej. glm-5.2) usan un campo
    de texto libre como muleta y dejan `operations` vacío describiendo el objeto en prosa. Sin ese
    campo, el modelo se ve forzado a enumerar la geometría como operaciones concretas.
    """

    operations: list[EntityOp] = Field(min_length=1)


class AiResult(BaseModel):
    """Resultado para la app (operaciones normalizadas + mensaje derivado)."""

    operations: list[EntityOp] = Field(default_factory=list)
    message: str = ""


class PartPlan(BaseModel):
    """Una pieza del objeto con su caja delimitadora (región asignada, en mm)."""

    name: str
    description: str = ""
    origin: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])  # esquina mínima
    size: list[float] = Field(default_factory=lambda: [10.0, 10.0, 10.0])  # ancho, profundidad, alto


class ScenePlan(BaseModel):
    """Plan jerárquico del objeto (salida del Planner). NO contiene geometría CAD."""

    object: str = ""
    category: str = ""
    subtype: str = ""
    style: str = ""
    bbox: list[float] = Field(default_factory=lambda: [100.0, 100.0, 100.0])  # ancho, profundidad, alto
    parts: list[PartPlan] = Field(min_length=1)


class PartGeometry(BaseModel):
    """Geometría de una pieza (salida del Diseñador de piezas): operaciones add en mundo."""

    operations: list[EntityOp] = Field(min_length=1)


class AiGenerateIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    document: dict[str, Any]  # DocumentData actual (contexto para editar)
    lod: int | None = None  # nivel de detalle 0..3 (None = default del pipeline)

    @model_validator(mode="after")
    def _limit_document_size(self) -> "AiGenerateIn":
        if len(json.dumps(self.document, default=str).encode("utf-8")) > _MAX_AI_DOCUMENT_BYTES:
            raise ValueError("document context is too large")
        return self


class AiGenerateOut(BaseModel):
    operations: list[EntityOp]
    message: str
