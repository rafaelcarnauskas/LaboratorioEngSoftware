"""Banco próprio ``choosen_comunidades`` (seção 4.2 do modelo de dados).

``comunidade``, ``nicho`` e ``participacao``, mais as tabelas técnicas
``mensagem_enviada`` e ``mensagem_recebida``. ``participacao.usuario_id`` e
``comunidade.criada_por`` são referências lógicas a ``usuario_publico`` (outro
banco, sem FK). O esquema vem das migrations de ``alembic_comunidades/``.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.base import UUID, DataHoraTZ
from app.mensageria.outbox import MensagemEnviadaMixin, MensagemRecebidaMixin

PAPEIS = ("membro", "moderador")


class BaseComunidades(DeclarativeBase):
    pass


class ComunidadeTabela(BaseComunidades):
    __tablename__ = "comunidade"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    descricao: Mapped[str] = mapped_column(Text, nullable=False, default="")
    criada_por: Mapped[str | None] = mapped_column(UUID, nullable=True)  # ref. lógica usuario_publico
    criada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class NichoTabela(BaseComunidades):
    __tablename__ = "nicho"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    comunidade_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("comunidade.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)


class Participacao(BaseComunidades):
    __tablename__ = "participacao"

    comunidade_id: Mapped[str] = mapped_column(
        String(80), ForeignKey("comunidade.id", ondelete="CASCADE"), primary_key=True,
    )
    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True, index=True)  # ref. lógica
    papel: Mapped[str] = mapped_column(Enum(*PAPEIS, name="papel_participacao"), nullable=False,
                                       default="membro")
    entrou_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class MensagemEnviada(MensagemEnviadaMixin, BaseComunidades):
    """Outbox: ComunidadeCriada, ComunidadeAtualizada, MembroEntrou e MembroSaiu."""


class MensagemRecebida(MensagemRecebidaMixin, BaseComunidades):
    """Consome UsuarioRemovido."""


# --- objetos devolvidos pelo serviço ------------------------------------------

@dataclass(frozen=True)
class Nicho:
    id: str
    nome: str


@dataclass(frozen=True)
class Comunidade:
    id: str
    nome: str
    descricao: str
    quantidade_membros: int
    nichos: tuple[Nicho, ...]
