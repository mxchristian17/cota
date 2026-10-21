from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.security import decode_token
from app.db.session import get_session
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session_cookie: Annotated[str | None, Cookie(alias="cota_session")] = None,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    # El bearer queda como compatibilidad para clientes API; el navegador usa sólo cookie HttpOnly.
    token = credentials.credentials if credentials is not None else session_cookie
    subject = (
        decode_token(token, settings.jwt_secret, settings.jwt_algorithm, settings.jwt_issuer, settings.jwt_audience)
        if token
        else None
    )
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        user_id = int(subject)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required") from exc
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user
