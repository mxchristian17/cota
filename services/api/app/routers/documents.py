from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.document import DocumentIn, DocumentOut, DocumentSummary
from app.services import document_service

router = APIRouter(prefix="/documents", tags=["documents"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[DocumentSummary])
def list_documents(user: CurrentUser, session: DbSession) -> list[DocumentSummary]:
    docs = document_service.list_for(session, user.id)
    return [
        DocumentSummary(id=d.id, name=d.name, folder=d.folder or "", updated_at=d.updated_at)
        for d in docs
    ]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(
    body: DocumentIn,
    user: CurrentUser,
    session: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> DocumentOut:
    doc = document_service.create(session, user.id, body.name, body.data, settings, body.folder)
    return DocumentOut.model_validate(doc, from_attributes=True)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, user: CurrentUser, session: DbSession) -> DocumentOut:
    doc = document_service.get(session, user.id, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return DocumentOut.model_validate(doc, from_attributes=True)


@router.put("/{doc_id}", response_model=DocumentOut)
def update_document(
    doc_id: str, body: DocumentIn, user: CurrentUser, session: DbSession
) -> DocumentOut:
    doc = document_service.update(session, user.id, doc_id, body.name, body.data, body.folder)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return DocumentOut.model_validate(doc, from_attributes=True)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: str, user: CurrentUser, session: DbSession) -> None:
    if not document_service.delete(session, user.id, doc_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
