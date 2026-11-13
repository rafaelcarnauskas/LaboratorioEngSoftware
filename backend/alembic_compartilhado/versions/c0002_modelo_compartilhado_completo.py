"""Banco compartilhado completo: dados compartilhados e tabelas da infraestrutura.

Seção 3 do modelo de dados. A usuario_publico da c0001 (com email, is_system_admin
e PK id) é trocada pela do modelo: PK usuario_id (uuid), username único e sem
e-mail. Ela é só uma réplica: depois do upgrade, `python -m app.autenticacao.republicar`
(ou `python -m app.db.migrar`) a preenche de novo a partir do banco da autenticação.

Cria também comunidade_publica, nicho_publico, video_publico e as tabelas da
infraestrutura: servico, permissao, assinatura, mensagem e entrega.

Revision ID: c0002
Revises: c0001
Create Date: 2026-11-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c0002"
down_revision: str | Sequence[str] | None = "c0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = sa.Uuid(as_uuid=False)
JSONB = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _instante(nome: str, nullable: bool = False) -> sa.Column:
    return sa.Column(nome, sa.DateTime(timezone=True), nullable=nullable)


def upgrade() -> None:
    op.drop_table("usuario_publico")

    # --- dados compartilhados ---
    op.create_table(
        "usuario_publico",
        sa.Column("usuario_id", UUID, nullable=False),
        sa.Column("username", sa.String(30), nullable=False),
        sa.Column("nome", sa.String(60), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("foto_url", sa.Text(), nullable=False),
        sa.Column("admin_comunidade", sa.Boolean(), nullable=False),
        _instante("atualizado_em"),
        sa.PrimaryKeyConstraint("usuario_id"),
        sa.UniqueConstraint("username", name="uq_usuario_publico_username"),
    )
    op.create_table(
        "comunidade_publica",
        sa.Column("comunidade_id", sa.String(80), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("quantidade_membros", sa.Integer(), nullable=False),
        _instante("atualizado_em"),
        sa.PrimaryKeyConstraint("comunidade_id"),
    )
    op.create_table(
        "nicho_publico",
        sa.Column("nicho_id", sa.String(80), nullable=False),
        sa.Column("comunidade_id", sa.String(80), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.ForeignKeyConstraint(["comunidade_id"], ["comunidade_publica.comunidade_id"],
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("nicho_id"),
    )
    op.create_index("ix_nicho_publico_comunidade_id", "nicho_publico", ["comunidade_id"])
    op.create_table(
        "video_publico",
        sa.Column("video_id", sa.String(80), nullable=False),
        sa.Column("autor_id", UUID, nullable=False),
        sa.Column("comunidade_id", sa.String(80), nullable=True),
        sa.Column("nicho_id", sa.String(80), nullable=True),
        sa.Column("titulo", sa.String(120), nullable=False),
        sa.Column("categoria", sa.String(40), nullable=False),
        sa.Column("duracao_segundos", sa.Integer(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("curtidas", sa.Integer(), nullable=False),
        sa.Column("comentarios", sa.Integer(), nullable=False),
        _instante("publicado_em"),
        _instante("atualizado_em"),
        sa.ForeignKeyConstraint(["autor_id"], ["usuario_publico.usuario_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["comunidade_id"], ["comunidade_publica.comunidade_id"],
                                ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["nicho_id"], ["nicho_publico.nicho_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("video_id"),
    )
    op.create_index("ix_video_publico_autor_id", "video_publico", ["autor_id"])
    op.create_index("ix_video_publico_comunidade_id", "video_publico", ["comunidade_id"])

    # --- infraestrutura ---
    op.create_table(
        "servico",
        sa.Column("servico_id", sa.String(40), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("url_base", sa.Text(), nullable=True),
        sa.Column("hash_credencial", sa.String(64), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("servico_id"),
    )
    op.create_table(
        "permissao",
        sa.Column("servico_id", sa.String(40), nullable=False),
        sa.Column("tabela", sa.String(60), nullable=False),
        sa.Column("pode_ler", sa.Boolean(), nullable=False),
        sa.Column("pode_escrever", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["servico_id"], ["servico.servico_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("servico_id", "tabela"),
    )
    op.create_table(
        "assinatura",
        sa.Column("servico_id", sa.String(40), nullable=False),
        sa.Column("tipo_mensagem", sa.String(60), nullable=False),
        sa.ForeignKeyConstraint(["servico_id"], ["servico.servico_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("servico_id", "tipo_mensagem"),
    )
    op.create_table(
        "mensagem",
        sa.Column("mensagem_id", UUID, nullable=False),
        sa.Column("tipo", sa.String(60), nullable=False),
        sa.Column("servico_origem", sa.String(40), nullable=False),
        sa.Column("chave_entidade", sa.String(255), nullable=False),
        sa.Column("conteudo", JSONB, nullable=False),
        _instante("criada_em"),
        sa.ForeignKeyConstraint(["servico_origem"], ["servico.servico_id"]),
        sa.PrimaryKeyConstraint("mensagem_id"),
    )
    op.create_index("ix_mensagem_tipo", "mensagem", ["tipo"])
    op.create_table(
        "entrega",
        sa.Column("mensagem_id", UUID, nullable=False),
        sa.Column("servico_destino", sa.String(40), nullable=False),
        sa.Column("status", sa.Enum("pendente", "entregue", "falhou", name="status_entrega"),
                  nullable=False),
        sa.Column("tentativas", sa.Integer(), nullable=False),
        _instante("entregue_em", nullable=True),
        sa.ForeignKeyConstraint(["mensagem_id"], ["mensagem.mensagem_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["servico_destino"], ["servico.servico_id"]),
        sa.PrimaryKeyConstraint("mensagem_id", "servico_destino"),
    )
    op.create_index("ix_entrega_status", "entrega", ["status"])


def downgrade() -> None:
    op.drop_index("ix_entrega_status", table_name="entrega")
    op.drop_table("entrega")
    sa.Enum(name="status_entrega").drop(op.get_bind(), checkfirst=True)
    op.drop_index("ix_mensagem_tipo", table_name="mensagem")
    op.drop_table("mensagem")
    op.drop_table("assinatura")
    op.drop_table("permissao")
    op.drop_table("servico")
    op.drop_index("ix_video_publico_comunidade_id", table_name="video_publico")
    op.drop_index("ix_video_publico_autor_id", table_name="video_publico")
    op.drop_table("video_publico")
    op.drop_index("ix_nicho_publico_comunidade_id", table_name="nicho_publico")
    op.drop_table("nicho_publico")
    op.drop_table("comunidade_publica")
    op.drop_table("usuario_publico")
    # Volta a réplica da c0001 (vazia; `republicar` da versão antiga a preenche).
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
