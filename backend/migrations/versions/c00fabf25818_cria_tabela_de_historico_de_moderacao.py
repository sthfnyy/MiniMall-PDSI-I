
"""cria tabela de historico de moderacao

Revision ID: c00fabf25818
Revises:
Create Date: 2026-11-09 10:50:07.376651
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c00fabf25818"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "registros_moderacao",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("administrador_id", sa.UUID(), nullable=False),
        sa.Column("avaliacao_id", sa.UUID(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["administrador_id"],
            ["auth.users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("registros_moderacao")
