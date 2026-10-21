from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.deps import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.config import ConfigIn, ConfigOut
from app.services import config_service

router = APIRouter(prefix="/config", tags=["config"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_session)]


@router.get("", response_model=ConfigOut)
def get_config(user: CurrentUser, session: DbSession) -> ConfigOut:
    # Se filtran las claves internas (config del LLM con la api key) — nunca van al cliente.
    return ConfigOut(data=config_service.strip_internal(config_service.get(session, user.id)))


@router.put("", response_model=ConfigOut)
def put_config(body: ConfigIn, user: CurrentUser, session: DbSession) -> ConfigOut:
    # Preserva las claves internas (config del LLM) que el cliente no envía.
    existing = config_service.get(session, user.id)
    merged = {**config_service.strip_internal(body.data)}
    for k, v in existing.items():
        if k.startswith("_"):
            merged[k] = v
    return ConfigOut(data=config_service.strip_internal(config_service.upsert(session, user.id, merged)))
