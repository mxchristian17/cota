import os
from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings

settings = get_settings()
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, echo=False, connect_args=_connect_args)


def init_db() -> None:
    """Crea esquema sólo en desarrollo; producción usa Alembic antes del deploy."""
    if settings.is_production:
        return
    # Asegura el directorio para SQLite basado en archivo.
    if settings.database_url.startswith("sqlite:///"):
        path = settings.database_url.replace("sqlite:///", "", 1)
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
    import app.models  # noqa: F401  (registra los modelos en la metadata)

    SQLModel.metadata.create_all(engine)
    _ensure_columns()


def _ensure_columns() -> None:
    """Migración liviana (dev): agrega columnas nuevas a tablas preexistentes (SQLite sin Alembic)."""
    insp = inspect(engine)
    if "document" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("document")}
    if "folder" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE document ADD COLUMN folder VARCHAR DEFAULT ''"))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
