"""Ambiente do Alembic do banco próprio choosen_videos.

Rode a partir de backend/: ``alembic -n videos upgrade head``. A URL vem de CHOOSEN_VIDEOS_DATABASE_URL.
"""

from app.core.config import carregar_configuracao
from app.db.alembic_env import rodar
from app.videos.modelo import BaseVideos

rodar(BaseVideos.metadata, carregar_configuracao().videos_database_url, "alembic_version_videos")
