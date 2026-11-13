"""Tabelas do banco compartilhado ``choosen_compartilhado`` (seção 3 do modelo de dados).

Dois grupos:

- **Dados compartilhados**, cada tabela com um único serviço dono (o único que
  escreve nela, pela infraestrutura): ``usuario_publico`` (Autenticação),
  ``comunidade_publica`` e ``nicho_publico`` (Comunidades) e ``video_publico`` (Vídeos).
- **Infraestrutura**: ``servico``, ``permissao``, ``assinatura``, ``mensagem`` e
  ``entrega``. Controlam quem lê/escreve cada tabela e registram as mensagens.

Nenhum microserviço conecta neste banco: o acesso é pela API de Dados
Compartilhados (:mod:`app.infraestrutura.dados`) e pelo barramento
(:mod:`app.infraestrutura.barramento`). O esquema vem só das migrations de
``alembic_compartilhado/``.
"""

from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.base import JSONB, UUID, DataHoraTZ

STATUS_ENTREGA = ("pendente", "entregue", "falhou")


class BaseCompartilhado(DeclarativeBase):
    pass


# --- Dados compartilhados ---------------------------------------------------

class UsuarioPublico(BaseCompartilhado):
    """Perfil público do usuário, sem e-mail, senha nem sessões. Dono: Autenticação."""

    __tablename__ = "usuario_publico"
    __table_args__ = (UniqueConstraint("username", name="uq_usuario_publico_username"),)

    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    username: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(60), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False, default="")
    foto_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    admin_comunidade: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    atualizado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class ComunidadePublica(BaseCompartilhado):
    """Dono: Comunidades. ``quantidade_membros`` é derivado (MembroEntrou/MembroSaiu)."""

    __tablename__ = "comunidade_publica"

    comunidade_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False, default="")
    quantidade_membros: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    atualizado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class NichoPublico(BaseCompartilhado):
    """Dono: Comunidades."""

    __tablename__ = "nicho_publico"

    nicho_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    comunidade_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("comunidade_publica.comunidade_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)


class VideoPublico(BaseCompartilhado):
    """Catálogo publicado. Dono: Vídeos. ``curtidas`` e ``comentarios`` são derivados."""

    __tablename__ = "video_publico"

    video_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    autor_id: Mapped[str] = mapped_column(
        UUID, ForeignKey("usuario_publico.usuario_id", ondelete="CASCADE"), nullable=False, index=True,
    )
    comunidade_id: Mapped[str | None] = mapped_column(
        String(80), ForeignKey("comunidade_publica.comunidade_id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    nicho_id: Mapped[str | None] = mapped_column(
        String(80), ForeignKey("nicho_publico.nicho_id", ondelete="SET NULL"), nullable=True,
    )
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    categoria: Mapped[str] = mapped_column(String(40), nullable=False)
    duracao_segundos: Mapped[int] = mapped_column(Integer, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    curtidas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comentarios: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    publicado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


# --- Infraestrutura ------------------------------------------------------------

class Servico(BaseCompartilhado):
    __tablename__ = "servico"

    servico_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    url_base: Mapped[str | None] = mapped_column(Text, nullable=True)
    # SHA-256 da credencial do serviço; sem ela, o serviço não usa a API HTTP.
    hash_credencial: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Permissao(BaseCompartilhado):
    __tablename__ = "permissao"

    servico_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("servico.servico_id", ondelete="CASCADE"), primary_key=True,
    )
    tabela: Mapped[str] = mapped_column(String(60), primary_key=True)
    pode_ler: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pode_escrever: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Assinatura(BaseCompartilhado):
    __tablename__ = "assinatura"

    servico_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("servico.servico_id", ondelete="CASCADE"), primary_key=True,
    )
    tipo_mensagem: Mapped[str] = mapped_column(String(60), primary_key=True)


class MensagemRegistrada(BaseCompartilhado):
    __tablename__ = "mensagem"

    mensagem_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    servico_origem: Mapped[str] = mapped_column(
        String(40), ForeignKey("servico.servico_id"), nullable=False,
    )
    chave_entidade: Mapped[str] = mapped_column(String(255), nullable=False)
    conteudo: Mapped[dict] = mapped_column(JSONB, nullable=False)
    criada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class Entrega(BaseCompartilhado):
    __tablename__ = "entrega"

    mensagem_id: Mapped[str] = mapped_column(
        UUID, ForeignKey("mensagem.mensagem_id", ondelete="CASCADE"), primary_key=True,
    )
    servico_destino: Mapped[str] = mapped_column(
        String(40), ForeignKey("servico.servico_id"), primary_key=True,
    )
    status: Mapped[str] = mapped_column(
        Enum(*STATUS_ENTREGA, name="status_entrega"), nullable=False, default="pendente", index=True,
    )
    tentativas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    entregue_em: Mapped[datetime | None] = mapped_column(DataHoraTZ, nullable=True)
