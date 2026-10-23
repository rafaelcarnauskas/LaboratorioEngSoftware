"""HTTP endpoints for the Videos context.

The application composes this router with its authentication and History
services. Example: ``app.include_router(create_router(videos, playback))``.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field

from .modelo import MockVideoRepository, Video
from .servico import (
    HistoryPersistenceError,
    InvalidWatchedSecondsError,
    PlaybackService,
    VideoNotFoundError,
    VideoService,
)


def _to_camel(name: str) -> str:
    first, *rest = name.split("_")
    return first + "".join(part.capitalize() for part in rest)


class VideoResponse(BaseModel):
    model_config = ConfigDict(
        alias_generator=_to_camel,
        from_attributes=True,
        populate_by_name=True,
    )

    id: str
    title: str
    category: str
    community_id: str
    niche_id: str
    author: str
    avatar: str | None
    image: str | None
    caption: str
    likes: int
    comment_count: int
    posted_at: str
    duration: int
    media_url: str | None


class PlaybackRequest(BaseModel):
    seconds: int = Field(ge=3, le=90, description="Tempo assistido, em segundos.")


class PlaybackResponse(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    message: str
    video_id: str
    seconds: int
    recorded_at: str


def _authenticated_user_from_request(request: Request) -> Any:
    """Fallback for apps whose auth middleware stores the user on request.state."""
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária para registrar uma visualização.",
        )
    return user


def _user_id(user: Any) -> str:
    if isinstance(user, dict):
        value = user.get("id", user.get("user_id"))
    else:
        value = getattr(user, "id", getattr(user, "user_id", None))
    if value is None or not str(value).strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A sessão autenticada não contém um identificador de usuário.",
        )
    return str(value)


def create_router(
    videos: VideoService,
    playback: PlaybackService,
    current_user_dependency: Callable[..., Any] = _authenticated_user_from_request,
) -> APIRouter:
    """Build the video API with services supplied by the application layer.

    ``current_user_dependency`` is provided by the authentication context when
    that module is integrated. ``PlaybackService`` receives the History service
    through its ``HistoryRecorder`` port.
    """
    router = APIRouter(prefix="/api/videos", tags=["Vídeos"])

    @router.get("", response_model=list[VideoResponse], name="listar_videos")
    def list_videos(
        category: str | None = Query(default=None),
        categoria: str | None = Query(default=None),
        community_id: str | None = Query(default=None),
        comunidade_id: str | None = Query(default=None),
        niches: list[str] = Query(default=[]),
        nichos: list[str] = Query(default=[]),
    ) -> list[Video]:
        selected_category = categoria or category
        selected_community = comunidade_id or community_id
        selected_niches = list(dict.fromkeys([*niches, *nichos]))
        return videos.list_videos(
            category=selected_category,
            community_id=selected_community,
            niche_ids=selected_niches,
        )

    @router.get("/{video_id}", response_model=VideoResponse, name="obter_video")
    def get_video(video_id: str) -> Video:
        try:
            return videos.get_video(video_id)
        except VideoNotFoundError as error:
            raise HTTPException(status_code=404, detail="Vídeo não encontrado.") from error

    @router.post(
        "/{video_id}/reproductions",
        response_model=PlaybackResponse,
        status_code=status.HTTP_201_CREATED,
        name="registrar_reproducao",
    )
    def register_playback(
        video_id: str,
        payload: PlaybackRequest,
        user: Any = Depends(current_user_dependency),
    ) -> PlaybackResponse:
        try:
            receipt = playback.register_view(
                user_id=_user_id(user),
                video_id=video_id,
                seconds_watched=payload.seconds,
            )
        except VideoNotFoundError as error:
            raise HTTPException(status_code=404, detail="Vídeo não encontrado.") from error
        except InvalidWatchedSecondsError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except HistoryPersistenceError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Não foi possível registrar a visualização no Histórico.",
            ) from error

        return PlaybackResponse(
            message="Visualização registrada.",
            video_id=receipt.video_id,
            seconds=receipt.seconds_watched,
            recorded_at=receipt.recorded_at.isoformat(),
        )

    return router


def create_default_router(
    history_recorder: Any,
    current_user_dependency: Callable[..., Any] = _authenticated_user_from_request,
) -> APIRouter:
    """Create the router with the demonstration catalog and supplied adapters."""
    video_service = VideoService(MockVideoRepository())
    playback_service = PlaybackService(video_service, history_recorder)
    return create_router(video_service, playback_service, current_user_dependency)
