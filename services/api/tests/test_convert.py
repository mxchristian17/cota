"""Tests del conversor DWG<->DXF. No requiere un binario DWG real:
se usa un script stub para la ruta exitosa y monkeypatch para la no disponible.
Los endpoints /convert exigen sesión: todos los tests autentican.
"""

import pytest
from fastapi.testclient import TestClient

from app.services import dwg_service
from tests.conftest import auth_headers


@pytest.fixture
def h(client: TestClient) -> dict[str, str]:
    return auth_headers(client, "conv@example.com")


def test_requires_authentication(client: TestClient) -> None:
    # Sin sesión, la conversión no está accesible (evita abuso anónimo del subprocess).
    assert client.get("/convert/status").status_code == 401
    assert client.post("/convert/dwg-to-dxf", content=b"DWGdata").status_code == 401


def test_status_reports_booleans(client: TestClient, h: dict[str, str]) -> None:
    r = client.get("/convert/status", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"dwgToDxf", "dxfToDwg"}
    assert isinstance(body["dwgToDxf"], bool)
    assert isinstance(body["dxfToDwg"], bool)


def test_dwg_to_dxf_unavailable_returns_501(client: TestClient, h: dict[str, str], monkeypatch) -> None:
    monkeypatch.setattr(dwg_service, "_resolve", lambda cmd: None)
    r = client.post("/convert/dwg-to-dxf", content=b"DWGdata", headers=h)
    assert r.status_code == 501


def test_dxf_to_dwg_unavailable_returns_501(client: TestClient, h: dict[str, str], monkeypatch) -> None:
    monkeypatch.setattr(dwg_service, "_resolve", lambda cmd: None)
    r = client.post("/convert/dxf-to-dwg", content=b"0\nSECTION\n0\nEOF\n", headers=h)
    assert r.status_code == 501


def test_empty_body_returns_400(client: TestClient, h: dict[str, str]) -> None:
    r = client.post("/convert/dwg-to-dxf", content=b"", headers=h)
    assert r.status_code == 400


def test_dwg_to_dxf_with_stub_converter(client: TestClient, h: dict[str, str], monkeypatch, tmp_path) -> None:
    # Stub que emula `conv -o OUT IN` copiando IN a OUT.
    script = tmp_path / "fakeconv.sh"
    script.write_text('#!/bin/sh\ncp "$3" "$2"\n')
    script.chmod(0o755)
    monkeypatch.setattr(dwg_service, "_resolve", lambda cmd: str(script))

    payload = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"
    r = client.post("/convert/dwg-to-dxf", content=payload, headers=h)
    assert r.status_code == 200
    assert r.content == payload  # el stub copia tal cual


def test_converter_error_returns_422(client: TestClient, h: dict[str, str], monkeypatch, tmp_path) -> None:
    # Stub que falla (exit 1) sin generar salida.
    script = tmp_path / "failconv.sh"
    script.write_text("#!/bin/sh\necho boom >&2\nexit 1\n")
    script.chmod(0o755)
    monkeypatch.setattr(dwg_service, "_resolve", lambda cmd: str(script))

    r = client.post("/convert/dxf-to-dwg", content=b"0\nEOF\n", headers=h)
    assert r.status_code == 422
