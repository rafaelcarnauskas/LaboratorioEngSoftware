"""Regras de negócio para consulta de vídeos e reprodução."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol, Sequence

from .modelo import Video, VideoRepository


MIN_WATCHED_SECONDS = 3
MAX_WATCHED_SECONDS = 90


class VideoNotFoundError(LookupError):
    """O identificador não corresponde a um vídeo do catálogo."""


class InvalidWatchedSecondsError(ValueError):
    """A duração enviada está fora do intervalo aceito para uma visualização."""


class HistoryPersistenceError(RuntimeError):
    """O serviço de Histórico não conseguiu persistir a visualização."""


class HistoryRecorder(Protocol):
    """Contrato de integração com o contexto Histórico.

    O contexto de Vídeos não grava histórico diretamente. A aplicação injeta
    aqui o serviço de Histórico durante a composição dos módulos.
    """

    def registrar_visualizacao(
        self,
        *,
        usuario_id: str,
        video_id: str,
        segundos_assistidos: int,
        ocorrido_em: datetime,
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class PlaybackReceipt:
    video_id: str
    seconds_watched: int
    recorded_at: datetime


class VideoService:
    def __init__(self, repository: VideoRepository) -> None:
        self._repository = repository

    def list_videos(
        self,
        *,
        category: str | None = None,
        community_id: str | None = None,
        niche_ids: Sequence[str] = (),
    ) -> list[Video]:
        return self._repository.list_videos(
            category=category,
            community_id=community_id,
            niche_ids=niche_ids,
        )

    def get_video(self, video_id: str) -> Video:
        video = self._repository.get_video(video_id)
        if video is None:
            raise VideoNotFoundError(video_id)
        return video


class PlaybackService:
    """Valida a reprodução e envia a visualização para o contexto Histórico."""

    def __init__(self, videos: VideoService, history: HistoryRecorder) -> None:
        self._videos = videos
        self._history = history

    def register_view(
        self,
        *,
        user_id: str,
        video_id: str,
        seconds_watched: int,
    ) -> PlaybackReceipt:
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

        recorded_at = datetime.now(timezone.utc)
        try:
            self._history.registrar_visualizacao(
                usuario_id=user_id,
                video_id=video_id,
                segundos_assistidos=seconds_watched,
                ocorrido_em=recorded_at,
            )
        except Exception as error:
            raise HistoryPersistenceError("Não foi possível registrar a visualização.") from error

        return PlaybackReceipt(
            video_id=video_id,
            seconds_watched=seconds_watched,
            recorded_at=recorded_at,
        )
