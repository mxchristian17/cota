from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from cryptography.fernet import Fernet
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_JWT_SECRETS = {
    "",
    "changeme",
    "dev-insecure-secret-change-me",
    "changeme-generate-a-strong-secret",
}
_DEV_FERNET_KEY = "uCSwQ9m_32j44TqYioT5bwmtGDa74JCY_KUrQ7cMG7Q="


class Settings(BaseSettings):
    """Configuración por entorno. Los secretos sólo se leen del entorno de ejecución."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    cota_env: Literal["dev", "qa", "prod"] = "dev"
    database_url: str = "sqlite:///./data/cota.db"
    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_expire_minutes: int = Field(default=30, ge=5, le=1440)
    jwt_issuer: str = "cota"
    jwt_audience: str = "cota-web"
    session_cookie_name: str = "cota_session"
    api_cors_origins: str = "http://localhost:5173"
    allowed_hosts: str = "localhost,127.0.0.1"
    # false = nadie puede crear cuentas nuevas (instancia privada); las existentes siguen entrando.
    allow_registration: bool = True
    app_base_url: str = "http://localhost:5173"
    secrets_encryption_key: str = _DEV_FERNET_KEY
    max_document_bytes: int = Field(default=5 * 1024 * 1024, ge=1024, le=20 * 1024 * 1024)
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=50 * 1024 * 1024)
    ai_allowed_base_urls: str = ""


    # Conversor DWG<->DXF (programas de GNU LibreDWG, externos a Cota).
    dwg2dxf_cmd: str = "dwg2dxf"
    dxf2dwg_cmd: str = "dxf2dwg"

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        # Los proveedores de PostgreSQL entregan `postgres://` o `postgresql://`; el driver instalado es psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    @field_validator("app_base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("APP_BASE_URL must be an absolute http(s) URL")
        return value.rstrip("/")

    @field_validator("secrets_encryption_key")
    @classmethod
    def validate_encryption_key(cls, value: str) -> str:
        try:
            Fernet(value.encode("utf-8"))
        except (TypeError, ValueError) as exc:
            raise ValueError("SECRETS_ENCRYPTION_KEY must be a valid Fernet key") from exc
        return value

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        # Fail-closed: los secretos por defecto del repo SÓLO se toleran en `dev` local.
        # Un entorno no-dev, o un APP_BASE_URL público (no localhost), obliga a secretos propios
        # aunque alguien olvide setear COTA_ENV=prod. Sin esto, un deploy mal configurado quedaría
        # con el JWT secret y la Fernet key conocidos del repo → suplantación de cuentas.
        if self.is_hardened:
            if self.jwt_secret in _INSECURE_JWT_SECRETS or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be a unique secret of at least 32 characters outside dev")
            if self.secrets_encryption_key == _DEV_FERNET_KEY:
                raise ValueError("SECRETS_ENCRYPTION_KEY must be a unique Fernet key outside dev")
        if self.is_production:
            if self.database_url.startswith("sqlite"):
                raise ValueError("DATABASE_URL must point to managed PostgreSQL in production")
            if not self.host_list or "*" in self.host_list:
                raise ValueError("ALLOWED_HOSTS must list the real host names in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.cota_env == "prod"

    @property
    def is_hardened(self) -> bool:
        """True cuando NO es dev local: exige secretos propios. Se dispara por entorno no-dev
        o por un APP_BASE_URL que no apunte a localhost (indicador de despliegue público)."""
        if self.cota_env != "dev":
            return True
        host = (urlparse(self.app_base_url).hostname or "").lower()
        return host not in {"localhost", "127.0.0.1", "::1"}

    @property
    def cors_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.api_cors_origins.split(",") if origin.strip()]

    @property
    def host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

    @property
    def ai_base_url_list(self) -> list[str]:
        return [url.strip().rstrip("/") for url in self.ai_allowed_base_urls.split(",") if url.strip()]



@lru_cache
def get_settings() -> Settings:
    return Settings()
