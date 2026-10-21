from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app

PASSWORD = "verysecure123"


def test_dev_accepts_proxy_host_header(client: TestClient) -> None:
    # En dev no se aplica TrustedHostMiddleware: el proxy de Vite reenvía con Host `api` (Docker) y
    # antes eso daba 400 "Invalid host header" → login 500 en localhost:5173.
    r = client.get("/health", headers={"Host": "api"})
    assert r.status_code == 200


def test_register_and_login_creates_httponly_session(client: TestClient) -> None:
    r = client.post("/auth/register", json={"email": "a@x.com", "password": PASSWORD})
    assert r.status_code == 201
    assert r.json()["email"] == "a@x.com"
    assert "subscription" not in r.json()  # gratis y sin planes: no hay límites de documentos

    r = client.post("/auth/login", json={"email": "A@x.com", "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "a@x.com"
    assert "access_token" not in r.json()
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "cota_session=" in cookie

    assert client.get("/auth/me").json()["email"] == "a@x.com"


def test_duplicate_registration_conflicts_case_insensitively(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "a@x.com", "password": PASSWORD})
    r = client.post("/auth/register", json={"email": "A@x.com", "password": PASSWORD})
    assert r.status_code == 409


def test_password_policy_and_invalid_login(client: TestClient) -> None:
    assert client.post("/auth/register", json={"email": "a@x.com", "password": "short"}).status_code == 422
    client.post("/auth/register", json={"email": "a@x.com", "password": PASSWORD})
    r = client.post("/auth/login", json={"email": "a@x.com", "password": "incorrectpass"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"


def test_protected_requires_session(client: TestClient) -> None:
    r = client.get("/documents")
    assert r.status_code == 401


def test_logout_revokes_browser_cookie(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "a@x.com", "password": PASSWORD})
    client.post("/auth/login", json={"email": "a@x.com", "password": PASSWORD})
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_password_over_72_bytes_is_rejected_not_500(client: TestClient) -> None:
    # bcrypt corta en 72 bytes: 40 "ñ" son 40 caracteres pero 80 bytes.
    r = client.post("/auth/register", json={"email": "n@example.com", "password": "ñ" * 40})
    assert r.status_code == 422


def test_registration_can_be_closed(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, allow_registration=False)
    r = client.post("/auth/register", json={"email": "c@example.com", "password": PASSWORD})
    assert r.status_code == 403
