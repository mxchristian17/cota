"""agent conversations

Revision ID: cota_003
Revises: cota_002
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision: str = "cota_003"
down_revision: str | None = "cota_002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_conversation",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), primary_key=True),
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(length=64), primary_key=True),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False, server_default=""),
        sa.Column("messages", sa.JSON(), nullable=True),
        sa.Column("context", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_conversation")
