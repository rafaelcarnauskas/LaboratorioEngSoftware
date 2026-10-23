"""Autenticação inicial: tabelas usuario, sessao e token_redefinicao.

Escrita à mão (não autogenerate) para criar só as tabelas da Parte 1; as
tabelas do historico continuam fora das migrations. Requisitos 13.2 e 13.8.

As colunas de data e hora usam DateTime sem fuso, que é o tipo gravado por
`DataHoraUTC` (o instante em UTC). Os valores padrão (`id`, `descricao`, `foto`,
`is_*`) são definidos pelo modelo em Python, não pelo banco.

Revision ID: 0001
Revises:
Create Date: 2026-10-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _data_hora(nome: str, nullable: bool = False) -> sa.Column:
    return sa.Column(nome, sa.DateTime(timezone=False), nullable=nullable)


def upgrade() -> None:
    op.create_table(
        "usuario",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("username", sa.String(30), nullable=False),
        sa.Column("username_normalizado", sa.String(30), nullable=False),
        sa.Column("hash_senha", sa.String(255), nullable=False),
        sa.Column("nome", sa.String(60), nullable=False),
        sa.Column("descricao", sa.String(160), nullable=False),
        sa.Column("foto", sa.Text(), nullable=False),
        sa.Column("is_community_admin", sa.Boolean(), nullable=False),
        sa.Column("is_system_admin", sa.Boolean(), nullable=False),
        _data_hora("criado_em"),
        _data_hora("atualizado_em"),
        sa.UniqueConstraint("email", name="uq_usuario_email"),
        sa.UniqueConstraint("username_normalizado", name="uq_usuario_username_normalizado"),
    )

    op.create_table(
        "sessao",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.String(36),
            sa.ForeignKey("usuario.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        _data_hora("criada_em"),
        _data_hora("expira_em"),
        _data_hora("revogada_em", nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_sessao_token_hash"),
    )
    op.create_index("ix_sessao_usuario_id", "sessao", ["usuario_id"])

    op.create_table(
        "token_redefinicao",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "usuario_id",
            sa.String(36),
            sa.ForeignKey("usuario.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        _data_hora("criado_em"),
        _data_hora("expira_em"),
        _data_hora("usado_em", nullable=True),
        _data_hora("invalidado_em", nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_token_redefinicao_token_hash"),
    )
    op.create_index("ix_token_redefinicao_usuario_id", "token_redefinicao", ["usuario_id"])


def downgrade() -> None:
    # Ordem inversa: as tabelas filhas saem antes de usuario.
    op.drop_index("ix_token_redefinicao_usuario_id", table_name="token_redefinicao")
    op.drop_table("token_redefinicao")
    op.drop_index("ix_sessao_usuario_id", table_name="sessao")
    op.drop_table("sessao")
    op.drop_table("usuario")
