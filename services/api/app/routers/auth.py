from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.core.deps import get_current_user
from app.core.security import create_access_token
from app.db.session import get_session
from app.models.user import User
from app.schemas.auth import LoginIn, RegisterIn, SessionOut, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(session: Session, user: User, settings: Settings) -> UserOut:
    return UserOut(id=user.id, email=user.email)


def _set_session_cookie(response: Response, user: User, settings: Settings) -> None:
    token = create_access_token(
        str(user.id),
        settings.jwt_secret,
        settings.jwt_algorithm,
        settings.jwt_expire_minutes,
        settings.jwt_issuer,
        settings.jwt_audience,
    )
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.is_hardened,
        samesite="lax",
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterIn,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UserOut:
    if not settings.allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is closed on this server")
    if auth_service.get_by_email(session, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = auth_service.register(session, body.email, body.password)
    return _user_out(session, user, settings)


@router.post("/login", response_model=SessionOut)
def login(
    body: LoginIn,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionOut:
    user = auth_service.authenticate(session, body.email, body.password)
    if user is None:
        # No revela si el email existe ni por qué falló la autenticación.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    _set_session_cookie(response, user, settings)
    return SessionOut(user=_user_out(session, user, settings))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, settings: Annotated[Settings, Depends(get_settings)]) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UserOut:
    return _user_out(session, user, settings)
