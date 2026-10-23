"""Entidades persistidas da Parte 1 (Autenticação e conta).

Nenhuma coluna guarda senha, Token_Sessao ou Token_Redefinicao em texto claro:
a senha vira `hash_senha` (Argon2id) e os tokens viram `token_hash` (SHA-256
em hexadecimal, 64 caracteres). Requisitos 1.5, 2.4 e 5.3.

As invariantes de conteúdo (e-mail normalizado, `username_normalizado ==
username.lower()`, `criado_em == atualizado_em` na criação) são mantidas pelo
serviço, que é o único a escrever nessas colunas.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, DataHoraUTC


def _novo_id() -> str:
    """UUID4 em texto (36 caracteres), gerado uma única vez por linha."""
    return str(uuid4())


class Usuario(Base):
    __tablename__ = "usuario"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_novo_id)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    username: Mapped[str] = mapped_column(String(30), nullable=False)
    username_normalizado: Mapped[str] = mapped_column(String(30), nullable=False)
    hash_senha: Mapped[str] = mapped_column(String(255), nullable=False)
    nome: Mapped[str] = mapped_column(String(60), nullable=False)
    descricao: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    foto: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_community_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)

    __table_args__ = (
        UniqueConstraint("email", name="uq_usuario_email"),
        UniqueConstraint("username_normalizado", name="uq_usuario_username_normalizado"),
    )


class Sessao(Base):
    __tablename__ = "sessao"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_novo_id)
    usuario_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("usuario.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    criada_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
    revogada_em: Mapped[datetime | None] = mapped_column(DataHoraUTC, nullable=True)

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_sessao_token_hash"),
        Index("ix_sessao_usuario_id", "usuario_id"),
    )


class TokenRedefinicao(Base):
    __tablename__ = "token_redefinicao"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_novo_id)
    usuario_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("usuario.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
    usado_em: Mapped[datetime | None] = mapped_column(DataHoraUTC, nullable=True)
    invalidado_em: Mapped[datetime | None] = mapped_column(DataHoraUTC, nullable=True)

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_token_redefinicao_token_hash"),
        Index("ix_token_redefinicao_usuario_id", "usuario_id"),
    )
