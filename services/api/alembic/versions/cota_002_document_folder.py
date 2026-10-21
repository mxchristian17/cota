"""document folder

Revision ID: cota_002
Revises: b44e5b49a5fa
Create Date: 2026-08-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "cota_002"
down_revision: str | None = "b44e5b49a5fa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("folder", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=""),
    )
    op.create_index(op.f("ix_document_folder"), "document", ["folder"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_document_folder"), table_name="document")
    op.drop_column("document", "folder")
