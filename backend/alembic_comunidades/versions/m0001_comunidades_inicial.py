"""Comunidades inicial: comunidade, nicho, participacao e mensagens.

Banco próprio choosen_comunidades (seção 4.2 do modelo de dados).
participacao.usuario_id e comunidade.criada_por são referências lógicas a
usuario_publico (outro banco, sem FK).

Revision ID: m0001
Revises: 
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'm0001'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('comunidade',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('nome', sa.String(length=80), nullable=False),
    sa.Column('descricao', sa.Text(), nullable=False),
    sa.Column('criada_por', sa.Uuid(as_uuid=False), nullable=True),
    sa.Column('criada_em', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nome')
    )
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
    op.create_table('nicho',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('comunidade_id', sa.String(length=80), nullable=False),
    sa.Column('nome', sa.String(length=80), nullable=False),
    sa.ForeignKeyConstraint(['comunidade_id'], ['comunidade.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('nicho', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_nicho_comunidade_id'), ['comunidade_id'], unique=False)
    op.create_table('participacao',
    sa.Column('comunidade_id', sa.String(length=80), nullable=False),
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('papel', sa.Enum('membro', 'moderador', name='papel_participacao'), nullable=False),
    sa.Column('entrou_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['comunidade_id'], ['comunidade.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('comunidade_id', 'usuario_id')
    )
    with op.batch_alter_table('participacao', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_participacao_usuario_id'), ['usuario_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('participacao', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_participacao_usuario_id'))
    op.drop_table('participacao')
    with op.batch_alter_table('nicho', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_nicho_comunidade_id'))
    op.drop_table('nicho')
    op.drop_table('mensagem_recebida')
    op.drop_table('mensagem_enviada')
    op.drop_table('comunidade')
    sa.Enum(name='papel_participacao').drop(op.get_bind(), checkfirst=True)
