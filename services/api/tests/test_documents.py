from fastapi.testclient import TestClient

from tests.conftest import auth_headers

DOC = {"name": "drawing1", "data": {"schemaVersion": 1, "entities": []}}


def test_document_crud(client: TestClient) -> None:
    h = auth_headers(client, "a@x.com")

    created = client.post("/documents", json=DOC, headers=h)
    assert created.status_code == 201
    doc_id = created.json()["id"]

    got = client.get(f"/documents/{doc_id}", headers=h)
    assert got.status_code == 200
    assert got.json()["name"] == "drawing1"
    assert got.json()["data"]["schemaVersion"] == 1

    listed = client.get("/documents", headers=h)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    updated = client.put(
        f"/documents/{doc_id}",
        json={"name": "renamed", "data": {"schemaVersion": 1, "entities": [1]}},
        headers=h,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "renamed"

    deleted = client.delete(f"/documents/{doc_id}", headers=h)
    assert deleted.status_code == 204
    assert client.get(f"/documents/{doc_id}", headers=h).status_code == 404


def test_documents_are_isolated_per_owner(client: TestClient) -> None:
    ha = auth_headers(client, "a@x.com")
    hb = auth_headers(client, "b@x.com")

    doc_id = client.post("/documents", json=DOC, headers=ha).json()["id"]

    # B no ve ni accede al documento de A
    assert client.get(f"/documents/{doc_id}", headers=hb).status_code == 404
    assert client.get("/documents", headers=hb).json() == []
    assert client.delete(f"/documents/{doc_id}", headers=hb).status_code == 404
    # A sí
    assert client.get(f"/documents/{doc_id}", headers=ha).status_code == 200


def test_no_document_limit(client: TestClient) -> None:
    # Gratis para todos: se pueden guardar todos los dibujos que se quiera.
    h = auth_headers(client, "many@example.com")
    for i in range(12):
        r = client.post("/documents", json={**DOC, "name": f"drawing-{i}"}, headers=h)
        assert r.status_code == 201
