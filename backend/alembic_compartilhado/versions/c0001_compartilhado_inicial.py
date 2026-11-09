"""Banco compartilhado inicial: tabela usuario_publico.

Réplica do Perfil_Publico de cada Usuario do banco próprio da autenticação.
Mesmo `id` de `usuario.id`, sem FK (bancos diferentes) e sem constraints únicas
além da PK: a unicidade de e-mail e username é garantida pelo banco próprio.

As colunas de data e hora usam DateTime sem fuso, como a 0001 do banco próprio.

Revision ID: c0001
Revises:
Create Date: 2026-11-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "usuario_publico",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("nome", sa.String(60), nullable=False),
        sa.Column("username", sa.String(30), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("descricao", sa.String(160), nullable=False),
        sa.Column("foto", sa.Text(), nullable=False),
        sa.Column("is_community_admin", sa.Boolean(), nullable=False),
        sa.Column("is_system_admin", sa.Boolean(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=False), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=False), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("usuario_publico")
