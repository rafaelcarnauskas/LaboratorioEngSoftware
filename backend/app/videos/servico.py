"""Regras do serviço de Vídeos sobre o banco próprio ``choosen_videos``.

- O catálogo devolvido pela API tem só vídeos ``publicado``. Autor e avatar vêm
  de ``usuario_publico`` pela API de Dados Compartilhados.
- Curtidas e comentários são contados nas tabelas daqui; cada mudança publica
  VideoAtualizado com os contadores, que a infraestrutura grava em ``video_publico``.
- Uma reprodução grava ``reproducao`` e publica ReproducaoRegistrada, consumida
  pelo Histórico. Vídeos nunca chama o Histórico direto.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.relogio import agora_utc
from app.infraestrutura.catalogo import USUARIO_PUBLICO
from app.infraestrutura.cliente import ClienteDadosCompartilhados
from app.mensageria import (
    REPRODUCAO_REGISTRADA,
    VIDEO_ATUALIZADO,
    VIDEO_PUBLICADO,
    VIDEO_REMOVIDO,
    Mensagem,
    instante_iso,
)
from app.mensageria.outbox import Outbox

from .modelo import Comentario, Curtida, Reproducao, Video, VideoTabela

logger = logging.getLogger("choosen.videos")

MIN_WATCHED_SECONDS = 3
MAX_WATCHED_SECONDS = 90
MAX_COMENTARIO = 500


class VideoNotFoundError(LookupError):
    """O identificador não corresponde a um vídeo publicado do catálogo."""


class InvalidWatchedSecondsError(ValueError):
    """A duração enviada está fora do intervalo aceito para uma visualização."""


@dataclass(frozen=True, slots=True)
class PlaybackReceipt:
    video_id: str
    seconds_watched: int
    recorded_at: datetime


def tempo_relativo(instante: datetime | None, agora: datetime) -> str:
    """Texto de ``postedAt`` (``"1 hour ago"``), o mesmo formato do catálogo antigo."""
    if instante is None:
        return ""
    segundos = max(int((agora - instante).total_seconds()), 0)
    for unidade, tamanho in (("day", 86400), ("hour", 3600), ("minute", 60)):
        quantidade = segundos // tamanho
        if quantidade:
            return f"{quantidade} {unidade}{'s' if quantidade > 1 else ''} ago"
    return "just now"


def _contar(sessao: Session, modelo, video_id: str) -> int:
    return sessao.scalar(select(func.count()).select_from(modelo).where(modelo.video_id == video_id)) or 0


class VideoService:
    def __init__(self, fabrica: sessionmaker, outbox: Outbox, dados: ClienteDadosCompartilhados) -> None:
        self._fabrica = fabrica
        self._outbox = outbox
        self._dados = dados

    # --- consulta --------------------------------------------------------------

    def list_videos(self, *, category: str | None = None, community_id: str | None = None,
                    niche_ids: Sequence[str] = ()) -> list[Video]:
        consulta = select(VideoTabela).where(VideoTabela.status == "publicado")
        if category is not None and category.strip():
            consulta = consulta.where(func.lower(VideoTabela.categoria) == category.strip().casefold())
        if community_id is not None:
            consulta = consulta.where(VideoTabela.comunidade_id == community_id.strip())
        if niche_ids:
            consulta = consulta.where(VideoTabela.nicho_id.in_(list(niche_ids)))
        consulta = consulta.order_by(VideoTabela.publicado_em.desc(), VideoTabela.id)
        with self._fabrica() as sessao:
            linhas = list(sessao.scalars(consulta))
            return self._montar(sessao, linhas)

    def get_video(self, video_id: str) -> Video:
        with self._fabrica() as sessao:
            linha = sessao.get(VideoTabela, video_id)
            if linha is None or linha.status != "publicado":
                raise VideoNotFoundError(video_id)
            return self._montar(sessao, [linha])[0]

    def _autores(self, autor_ids: set[str]) -> dict[str, dict]:
        if not autor_ids:
            return {}
        try:
            perfis = self._dados.listar(USUARIO_PUBLICO, usuario_id=sorted(autor_ids))
        except Exception as erro:  # noqa: BLE001 - catálogo continua sem o nome do autor
            logger.warning("usuario_publico indisponível (%s).", type(erro).__name__)
            return {}
        return {p["usuario_id"]: p for p in perfis}

    def _montar(self, sessao: Session, linhas: list[VideoTabela]) -> list[Video]:
        autores = self._autores({l.autor_id for l in linhas})
        agora = agora_utc()
        videos = []
        for l in linhas:
            autor = autores.get(l.autor_id, {})
            videos.append(Video(
                id=l.id, title=l.titulo, category=l.categoria, community_id=l.comunidade_id,
                niche_id=l.nicho_id, author=autor.get("username", ""), avatar=autor.get("foto_url") or None,
                image=l.thumbnail_url, caption=l.legenda, likes=_contar(sessao, Curtida, l.id),
                comment_count=_contar(sessao, Comentario, l.id),
                posted_at=tempo_relativo(l.publicado_em, agora), duration=l.duracao_segundos,
                media_url=l.midia_url,
            ))
        return videos

    # --- escrita ---------------------------------------------------------------

    def _conteudo(self, sessao: Session, linha: VideoTabela) -> dict:
        autor = self._autores({linha.autor_id}).get(linha.autor_id, {})
        return {
            "video_id": linha.id,
            "autor_id": linha.autor_id,
            "autor_username": autor.get("username", ""),
            "comunidade_id": linha.comunidade_id,
            "nicho_id": linha.nicho_id,
            "titulo": linha.titulo,
            "categoria": linha.categoria,
            "duracao_segundos": linha.duracao_segundos,
            "thumbnail_url": linha.thumbnail_url,
            "curtidas": _contar(sessao, Curtida, linha.id),
            "comentarios": _contar(sessao, Comentario, linha.id),
            "publicado_em": instante_iso(linha.publicado_em or agora_utc()),
            "atualizado_em": instante_iso(agora_utc()),
        }

    def salvar_video(self, *, video_id: str, autor_id: str, comunidade_id: str, nicho_id: str | None,
                     titulo: str, legenda: str, categoria: str, duracao_segundos: int,
                     thumbnail_url: str | None, midia_url: str | None = None,
                     publicado_em: datetime | None = None) -> None:
        """Cria ou atualiza um vídeo já publicado; publica VideoPublicado/VideoAtualizado."""
        with self._fabrica.begin() as sessao:
            linha = sessao.get(VideoTabela, video_id)
            novo = linha is None or linha.status != "publicado"
            if linha is None:
                linha = VideoTabela(id=video_id)
                sessao.add(linha)
            linha.autor_id = autor_id
            linha.comunidade_id = comunidade_id
            linha.nicho_id = nicho_id
            linha.titulo = titulo
            linha.legenda = legenda
            linha.categoria = categoria
            linha.duracao_segundos = duracao_segundos
            linha.thumbnail_url = thumbnail_url
            linha.midia_url = midia_url
            linha.status = "publicado"
            linha.publicado_em = publicado_em or linha.publicado_em or agora_utc()
            sessao.flush()
            self._outbox.registrar(sessao, VIDEO_PUBLICADO if novo else VIDEO_ATUALIZADO, video_id,
                                   self._conteudo(sessao, linha))

    def _publicado(self, sessao: Session, video_id: str) -> VideoTabela:
        linha = sessao.get(VideoTabela, video_id)
        if linha is None or linha.status != "publicado":
            raise VideoNotFoundError(video_id)
        return linha

    def curtir(self, video_id: str, usuario_id: str, curtir: bool = True) -> Video:
        with self._fabrica.begin() as sessao:
            linha = self._publicado(sessao, video_id)
            atual = sessao.get(Curtida, (video_id, usuario_id))
            if curtir and atual is None:
                sessao.add(Curtida(video_id=video_id, usuario_id=usuario_id, criada_em=agora_utc()))
            elif not curtir and atual is not None:
                sessao.delete(atual)
            else:
                linha = None
            if linha is not None:
                sessao.flush()
                self._outbox.registrar(sessao, VIDEO_ATUALIZADO, video_id, self._conteudo(sessao, linha))
        return self.get_video(video_id)

    def comentar(self, video_id: str, usuario_id: str, texto: str) -> Video:
        texto = (texto or "").strip()
        if not texto or len(texto) > MAX_COMENTARIO:
            raise ValueError(f"O comentário deve ter de 1 a {MAX_COMENTARIO} caracteres.")
        with self._fabrica.begin() as sessao:
            linha = self._publicado(sessao, video_id)
            sessao.add(Comentario(id=str(uuid4()), video_id=video_id, usuario_id=usuario_id, texto=texto,
                                  criado_em=agora_utc()))
            sessao.flush()
            self._outbox.registrar(sessao, VIDEO_ATUALIZADO, video_id, self._conteudo(sessao, linha))
        return self.get_video(video_id)

    def registrar_reproducao(self, *, usuario_id: str, video_id: str, segundos: int) -> PlaybackReceipt:
        agora = agora_utc()
        with self._fabrica.begin() as sessao:
            self._publicado(sessao, video_id)
            reproducao_id = str(uuid4())
            sessao.add(Reproducao(id=reproducao_id, video_id=video_id, usuario_id=usuario_id,
                                  segundos_assistidos=segundos, iniciada_em=agora))
            self._outbox.registrar(sessao, REPRODUCAO_REGISTRADA, video_id, {
                "reproducao_id": reproducao_id,
                "video_id": video_id,
                "usuario_id": usuario_id,
                "segundos_assistidos": segundos,
                "iniciada_em": instante_iso(agora),
            })
        return PlaybackReceipt(video_id=video_id, seconds_watched=segundos, recorded_at=agora)

    # --- consumidor ----------------------------------------------------------------

    def ao_remover_usuario(self, sessao: Session, mensagem: Mensagem) -> None:
        """UsuarioRemovido: tira os vídeos do autor do catálogo e apaga as interações dele."""
        usuario_id = mensagem.conteudo["usuario_id"]
        afetados = set(sessao.scalars(select(Curtida.video_id).where(Curtida.usuario_id == usuario_id)))
        afetados |= set(sessao.scalars(select(Comentario.video_id).where(Comentario.usuario_id == usuario_id)))
        sessao.execute(delete(Curtida).where(Curtida.usuario_id == usuario_id))
        sessao.execute(delete(Comentario).where(Comentario.usuario_id == usuario_id))
        sessao.execute(delete(Reproducao).where(Reproducao.usuario_id == usuario_id))
        do_autor = sessao.scalars(select(VideoTabela).where(VideoTabela.autor_id == usuario_id,
                                                            VideoTabela.status != "removido")).all()
        for linha in do_autor:
            linha.status = "removido"
            afetados.discard(linha.id)
            self._outbox.registrar(sessao, VIDEO_REMOVIDO, linha.id, {"video_id": linha.id})
        sessao.flush()
        for video_id in sorted(afetados):
            linha = sessao.get(VideoTabela, video_id)
            if linha is not None and linha.status == "publicado":
                self._outbox.registrar(sessao, VIDEO_ATUALIZADO, video_id, self._conteudo(sessao, linha))


class PlaybackService:
    """Valida a reprodução e a registra (o Histórico recebe por mensagem)."""

    def __init__(self, videos: VideoService) -> None:
        self._videos = videos

    def register_view(self, *, user_id: str, video_id: str, seconds_watched: int) -> PlaybackReceipt:
        self._videos.get_video(video_id)
        if (
            isinstance(seconds_watched, bool)
            or not isinstance(seconds_watched, int)
            or not MIN_WATCHED_SECONDS <= seconds_watched <= MAX_WATCHED_SECONDS
        ):
            raise InvalidWatchedSecondsError(
                f"seconds_watched deve ser um inteiro entre {MIN_WATCHED_SECONDS} "
                f"e {MAX_WATCHED_SECONDS}."
            )
        return self._videos.registrar_reproducao(usuario_id=user_id, video_id=video_id,
                                                 segundos=seconds_watched)
