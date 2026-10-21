from sqlmodel import Session, select

from app.core.security import hash_password, verify_password
from app.models.user import User

# Hash bcrypt fijo para igualar el coste cuando el email no existe: sin esto, el caso
# "usuario inexistente" no ejecuta bcrypt y la diferencia de latencia permite enumerar emails.
_DUMMY_HASH = hash_password("cota-timing-equalizer")


def get_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).first()


def register(session: Session, email: str, password: str) -> User:
    user = User(email=email, hashed_password=hash_password(password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def authenticate(session: Session, email: str, password: str) -> User | None:
    user = get_by_email(session, email)
    if user is None:
        verify_password(password, _DUMMY_HASH)  # iguala el tiempo de respuesta (anti-enumeración)
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
