"""Histórico inicial: visualizacao, preferencia_tempo e mensagens.

Banco próprio choosen_historico (seção 4.5 do modelo de dados). As tabelas
são chaveadas pelo usuario_id, referência lógica a usuario_publico.

Revision ID: h0001
Revises: 
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'h0001'
down_revision: str | Sequence[str] | None = None
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
    op.create_table('preferencia_tempo',
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('limite_diario_minutos', sa.Integer(), nullable=False),
    sa.Column('lembrete_dormir', sa.Boolean(), nullable=False),
    sa.Column('lembrete_tempo_tela', sa.Boolean(), nullable=False),
    sa.Column('resumo_semanal', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('usuario_id')
    )
    op.create_table('visualizacao',
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('video_id', sa.String(length=80), nullable=False),
    sa.Column('segundos_assistidos', sa.Integer(), nullable=False),
    sa.Column('assistido_em', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('usuario_id', 'video_id')
    )


def downgrade() -> None:
    op.drop_table('visualizacao')
    op.drop_table('preferencia_tempo')
    op.drop_table('mensagem_recebida')
    op.drop_table('mensagem_enviada')
