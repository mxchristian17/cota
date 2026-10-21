from typing import Any
from urllib.parse import urlparse

from sqlmodel import Session

from app.core.config import get_settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models.user_config import UserConfig


def get(session: Session, user_id: int) -> dict[str, Any]:
    cfg = session.get(UserConfig, user_id)
    return cfg.data if cfg else {}


def upsert(session: Session, user_id: int, data: dict[str, Any]) -> dict[str, Any]:
    cfg = session.get(UserConfig, user_id)
    if cfg is None:
        cfg = UserConfig(user_id=user_id, data=data)
    else:
        cfg.data = data
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg.data


# Clave interna de la config del usuario donde vive la config del LLM (incluida la api key).
# NUNCA se devuelve al cliente por /config (se filtra en el router) — sólo se usa server-side.
AI_KEY = "_ai"


def strip_internal(data: dict[str, Any]) -> dict[str, Any]:
    """Quita las claves internas (p.ej. la config del LLM con la api key) antes de responder."""
    return {k: v for k, v in data.items() if not k.startswith("_")}


def get_ai(session: Session, user_id: int) -> dict[str, Any]:
    ai = get(session, user_id).get(AI_KEY)
    if not isinstance(ai, dict):
        return {}
    # Sólo se cifra la clave; proveedor/modelo quedan consultables para el backend.
    encrypted_key = ai.get("api_key_encrypted")
    if isinstance(encrypted_key, str):
        try:
            return {**ai, "api_key": decrypt_secret(encrypted_key, get_settings().secrets_encryption_key)}
        except ValueError:
            # Nunca devolvemos ni registramos el material cifrado/descifrado.
            return {}
    # Compatibilidad con instalaciones anteriores: se re-cifra en el próximo PUT de configuración.
    return ai


def set_ai(session: Session, user_id: int, ai: dict[str, Any]) -> None:
    data = get(session, user_id)
    key = ai.get("api_key")
    if not isinstance(key, str) or not key:
        raise ValueError("AI API key is required")
    data[AI_KEY] = {
        "provider": ai.get("provider", "openai"),
        "api_base": ai.get("api_base"),
        "model": ai.get("model", ""),
        "api_key_encrypted": encrypt_secret(key, get_settings().secrets_encryption_key),
    }
    upsert(session, user_id, data)


def validate_ai_base_url(api_base: str | None) -> None:
    """Evita que una API key de usuario convierta el backend en proxy SSRF."""
    if api_base is None:
        return
    parsed = urlparse(api_base)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("AI API base must be an allowed HTTPS URL")
    normalized = api_base.rstrip("/")
    if normalized not in get_settings().ai_base_url_list:
        raise ValueError("AI API base is not allowed")
