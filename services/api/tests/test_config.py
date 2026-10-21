import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core.config import Settings
from tests.conftest import auth_headers


def test_hardened_env_rejects_default_secrets() -> None:
    # Un APP_BASE_URL público (no localhost) obliga a secretos propios aunque cota_env siga en dev.
    with pytest.raises(ValueError):
        Settings(_env_file=None, app_base_url="https://cota.example.com")


def test_dev_localhost_allows_defaults() -> None:
    s = Settings(_env_file=None, cota_env="dev", app_base_url="http://localhost:5173")
    assert s.is_hardened is False


def test_prod_requires_postgres() -> None:
    key = Fernet.generate_key().decode("utf-8")
    with pytest.raises(ValueError):
        Settings(
            _env_file=None,
            cota_env="prod",
            jwt_secret="a" * 40,
            secrets_encryption_key=key,
            app_base_url="https://cota.example.com",
            database_url="sqlite:///./data/cota.db",
        )


@pytest.mark.parametrize("url", ["postgres://u:p@h/db?sslmode=require", "postgresql://u:p@h/db?sslmode=require"])
def test_database_url_uses_psycopg3(url: str) -> None:
    # Los proveedores entregan la URL sin driver; SQLAlchemy usaría psycopg2, que no está instalado.
    s = Settings(_env_file=None, database_url=url)
    assert s.database_url == "postgresql+psycopg://u:p@h/db?sslmode=require"


def test_config_default_empty_then_persisted(client: TestClient) -> None:
    h = auth_headers(client, "a@x.com")

    assert client.get("/config", headers=h).json() == {"data": {}}

    put = client.put("/config", json={"data": {"theme": "dark", "ortho": True}}, headers=h)
    assert put.status_code == 200
    assert put.json()["data"]["theme"] == "dark"

    got = client.get("/config", headers=h)
    assert got.json()["data"] == {"theme": "dark", "ortho": True}


def test_settings_reject_unsafe_jwt_algorithm_and_wildcard_hosts() -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, jwt_algorithm="none")
    key = Fernet.generate_key().decode("utf-8")
    with pytest.raises(ValueError):
        Settings(
            _env_file=None,
            cota_env="prod",
            jwt_secret="a" * 40,
            secrets_encryption_key=key,
            app_base_url="https://cota.example.com",
            database_url="postgresql://u:p@h/db",
            allowed_hosts="*",
        )


def test_config_rejects_oversized_settings(client: TestClient) -> None:
    h = auth_headers(client, "big@example.com")
    r = client.put("/config", json={"data": {"blob": "x" * (300 * 1024)}}, headers=h)
    assert r.status_code == 422
