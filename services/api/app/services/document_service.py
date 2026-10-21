import uuid
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from app.core.config import Settings
from app.models.document import Document


def list_for(session: Session, owner_id: int) -> list[Document]:
    stmt = select(Document).where(Document.owner_id == owner_id).order_by(Document.updated_at.desc())
    return list(session.exec(stmt).all())


def get(session: Session, owner_id: int, doc_id: str) -> Document | None:
    doc = session.get(Document, doc_id)
    if doc is None or doc.owner_id != owner_id:
        return None
    return doc


def create(
    session: Session,
    owner_id: int,
    name: str,
    data: dict[str, Any],
    settings: Settings,
    folder: str = "",
) -> Document:
    doc = Document(id=uuid.uuid4().hex, owner_id=owner_id, name=name, folder=folder, data=data)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


def update(
    session: Session,
    owner_id: int,
    doc_id: str,
    name: str,
    data: dict[str, Any],
    folder: str = "",
) -> Document | None:
    doc = get(session, owner_id, doc_id)
    if doc is None:
        return None
    doc.name = name
    doc.folder = folder
    doc.data = data
    doc.updated_at = datetime.now(UTC)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc


def delete(session: Session, owner_id: int, doc_id: str) -> bool:
    doc = get(session, owner_id, doc_id)
    if doc is None:
        return False
    session.delete(doc)
    session.commit()
    return True
