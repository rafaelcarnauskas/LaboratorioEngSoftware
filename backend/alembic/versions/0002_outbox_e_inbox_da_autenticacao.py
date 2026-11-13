"""Outbox e inbox da autenticação: tabelas mensagem_enviada e mensagem_recebida.

mensagem_enviada guarda UsuarioCadastrado, PerfilAtualizado e UsuarioRemovido na
mesma transação da mudança (padrão outbox); mensagem_recebida existe em todo
banco próprio, embora a autenticação ainda não assine mensagens.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: str | Sequence[str] | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('mensagem_enviada',
    sa.Column('mensagem_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('tipo', sa.String(length=60), nullable=False),
    sa.Column('chave_entidade', sa.String(length=255), nullable=False),
    sa.Column('conteudo', sa.JSON().with_variant(postgresql.JSONB(), 'postgresql'), nullable=False),
    sa.Column('criada_em', sa.DateTime(timezone=True), nullable=False),
    sa.Column('publicada_em', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('mensagem_id')
    )
    op.create_table('mensagem_recebida',
    sa.Column('mensagem_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('tipo', sa.String(length=60), nullable=False),
    sa.Column('servico_origem', sa.String(length=40), nullable=False),
    sa.Column('recebida_em', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('mensagem_id')
    )


def downgrade() -> None:
    op.drop_table('mensagem_recebida')
    op.drop_table('mensagem_enviada')
