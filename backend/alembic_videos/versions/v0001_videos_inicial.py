"""Vídeos inicial: video, curtida, comentario, reproducao e mensagens.

Banco próprio choosen_videos (seção 4.3 do modelo de dados). autor_id,
comunidade_id, nicho_id e usuario_id são referências lógicas ao banco
compartilhado (sem FK).

Revision ID: v0001
Revises: 
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'v0001'
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
    op.create_table('video',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('autor_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('comunidade_id', sa.String(length=80), nullable=False),
    sa.Column('nicho_id', sa.String(length=80), nullable=True),
    sa.Column('titulo', sa.String(length=120), nullable=False),
    sa.Column('legenda', sa.Text(), nullable=False),
    sa.Column('categoria', sa.String(length=40), nullable=False),
    sa.Column('duracao_segundos', sa.Integer(), nullable=False),
    sa.Column('midia_url', sa.Text(), nullable=True),
    sa.Column('thumbnail_url', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('rascunho', 'publicado', 'removido', name='status_video'), nullable=False),
    sa.Column('publicado_em', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('video', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_video_autor_id'), ['autor_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_video_categoria'), ['categoria'], unique=False)
        batch_op.create_index(batch_op.f('ix_video_comunidade_id'), ['comunidade_id'], unique=False)
    op.create_table('comentario',
    sa.Column('id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('video_id', sa.String(length=80), nullable=False),
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('texto', sa.Text(), nullable=False),
    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['video_id'], ['video.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('comentario', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_comentario_usuario_id'), ['usuario_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_comentario_video_id'), ['video_id'], unique=False)
    op.create_table('curtida',
    sa.Column('video_id', sa.String(length=80), nullable=False),
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('criada_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['video_id'], ['video.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('video_id', 'usuario_id')
    )
    with op.batch_alter_table('curtida', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_curtida_usuario_id'), ['usuario_id'], unique=False)
    op.create_table('reproducao',
    sa.Column('id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('video_id', sa.String(length=80), nullable=False),
    sa.Column('usuario_id', sa.Uuid(as_uuid=False), nullable=False),
    sa.Column('segundos_assistidos', sa.Integer(), nullable=False),
    sa.Column('iniciada_em', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['video_id'], ['video.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('reproducao', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reproducao_usuario_id'), ['usuario_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reproducao_video_id'), ['video_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('reproducao', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reproducao_video_id'))
        batch_op.drop_index(batch_op.f('ix_reproducao_usuario_id'))
    op.drop_table('reproducao')
    with op.batch_alter_table('curtida', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_curtida_usuario_id'))
    op.drop_table('curtida')
    with op.batch_alter_table('comentario', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_comentario_video_id'))
        batch_op.drop_index(batch_op.f('ix_comentario_usuario_id'))
    op.drop_table('comentario')
    with op.batch_alter_table('video', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_video_comunidade_id'))
        batch_op.drop_index(batch_op.f('ix_video_categoria'))
        batch_op.drop_index(batch_op.f('ix_video_autor_id'))
    op.drop_table('video')
    op.drop_table('mensagem_recebida')
    op.drop_table('mensagem_enviada')
    sa.Enum(name='status_video').drop(op.get_bind(), checkfirst=True)
