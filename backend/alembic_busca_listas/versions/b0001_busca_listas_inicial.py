"""Busca e Listas inicial: lista, item_lista, indice_busca e mensagens.

Banco próprio choosen_busca_listas (seção 4.4 do modelo de dados). A chave
de lista é (usuario_id, id): o front gera o id e as listas iniciais têm ids
fixos, iguais para todos os usuários.

Revision ID: b0001
Revises: 
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b0001'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('indice_busca',
    sa.Column('video_id', sa.String(length=80), nullable=False),
    sa.Column('titulo', sa.String(length=120), nullable=False),
    sa.Column('texto_normalizado', sa.Text(), nullable=False),
    sa.Column('categoria', sa.String(length=40), nullable=False),
    sa.Column('comunidade_id', sa.String(length=80), nullable=True),
    sa.Column('duracao_segundos', sa.Integer(), nullable=True),
    sa.Column('autor', sa.String(length=30), nullable=False),
    sa.Column('thumbnail_url', sa.Text(), nullable=True),
    sa.Column('publicado_em', sa.DateTime(timezone=True), nullable=True),
    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('video_id')
    )
    with op.batch_alter_table('indice_busca', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_indice_busca_categoria'), ['categoria'], unique=False)
    op.create_table('lista',
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('nome', sa.String(length=60), nullable=False),
    sa.Column('descricao', sa.String(length=180), nullable=False),
    sa.Column('tom', sa.Enum('gold', 'blue', 'green', 'purple', name='tom_lista'), nullable=False),
    sa.Column('criada_em', sa.DateTime(timezone=True), nullable=False),
    sa.Column('atualizada_em', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('usuario_id', 'id')
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
    op.create_table('item_lista',
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('lista_id', sa.String(length=80), nullable=False),
    sa.Column('video_id', sa.String(length=80), nullable=False),
    sa.Column('posicao', sa.Integer(), nullable=False),
    sa.Column('adicionado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id', 'lista_id'], ['lista.usuario_id', 'lista.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('usuario_id', 'lista_id', 'video_id')
    )


def downgrade() -> None:
    op.drop_table('item_lista')
    op.drop_table('mensagem_recebida')
    op.drop_table('mensagem_enviada')
    op.drop_table('lista')
    with op.batch_alter_table('indice_busca', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_indice_busca_categoria'))
    op.drop_table('indice_busca')
    sa.Enum(name='tom_lista').drop(op.get_bind(), checkfirst=True)
