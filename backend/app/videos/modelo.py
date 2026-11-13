"""Banco próprio ``choosen_videos`` (seção 4.3 do modelo de dados).

Catálogo completo (``video``), interações (``curtida``, ``comentario``) e
reproduções (``reproducao``), mais ``mensagem_enviada`` e ``mensagem_recebida``.
``autor_id``, ``comunidade_id``, ``nicho_id`` e ``usuario_id`` são referências
lógicas ao banco compartilhado (sem FK). O esquema vem de ``alembic_videos/``.

:class:`Video` é o objeto devolvido pela API; o autor e o avatar vêm de
``usuario_publico`` e as curtidas/comentários são contados nas tabelas daqui.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.base import UUID, DataHoraTZ
from app.mensageria.outbox import MensagemEnviadaMixin, MensagemRecebidaMixin

STATUS_VIDEO = ("rascunho", "publicado", "removido")


class BaseVideos(DeclarativeBase):
    pass


class VideoTabela(BaseVideos):
    __tablename__ = "video"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    autor_id: Mapped[str] = mapped_column(UUID, nullable=False, index=True)  # ref. lógica usuario_publico
    comunidade_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)  # ref. lógica
    nicho_id: Mapped[str | None] = mapped_column(String(80), nullable=True)  # ref. lógica nicho_publico
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    legenda: Mapped[str] = mapped_column(Text, nullable=False, default="")
    categoria: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    duracao_segundos: Mapped[int] = mapped_column(Integer, nullable=False)
    midia_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Enum(*STATUS_VIDEO, name="status_video"), nullable=False,
                                        default="rascunho")
    publicado_em: Mapped[datetime | None] = mapped_column(DataHoraTZ, nullable=True)


class Curtida(BaseVideos):
    __tablename__ = "curtida"

    video_id: Mapped[str] = mapped_column(String(80), ForeignKey("video.id", ondelete="CASCADE"),
                                          primary_key=True)
    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True, index=True)  # ref. lógica
    criada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class Comentario(BaseVideos):
    __tablename__ = "comentario"

    id: Mapped[str] = mapped_column(UUID, primary_key=True)
    video_id: Mapped[str] = mapped_column(String(80), ForeignKey("video.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    usuario_id: Mapped[str] = mapped_column(UUID, nullable=False, index=True)  # ref. lógica
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class Reproducao(BaseVideos):
    __tablename__ = "reproducao"

    id: Mapped[str] = mapped_column(UUID, primary_key=True)
    video_id: Mapped[str] = mapped_column(String(80), ForeignKey("video.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    usuario_id: Mapped[str] = mapped_column(UUID, nullable=False, index=True)  # ref. lógica
    segundos_assistidos: Mapped[int] = mapped_column(Integer, nullable=False)
    iniciada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class MensagemEnviada(MensagemEnviadaMixin, BaseVideos):
    """Outbox: VideoPublicado, VideoAtualizado, VideoRemovido e ReproducaoRegistrada."""


class MensagemRecebida(MensagemRecebidaMixin, BaseVideos):
    """Consome UsuarioRemovido."""


@dataclass(frozen=True, slots=True)
class Video:
    id: str
    title: str
    category: str
    community_id: str
    niche_id: str | None
    author: str
    avatar: str | None
    image: str | None
    caption: str
    likes: int
    comment_count: int
    posted_at: str
    duration: int
    media_url: str | None = None
