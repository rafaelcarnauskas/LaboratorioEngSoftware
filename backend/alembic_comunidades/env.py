"""Ambiente do Alembic do banco próprio choosen_comunidades.

Rode a partir de backend/: ``alembic -n comunidades upgrade head``. A URL vem de CHOOSEN_COMUNIDADES_DATABASE_URL.
"""

from app.core.config import carregar_configuracao
from app.db.alembic_env import rodar
from app.comunidades.modelo import BaseComunidades

rodar(BaseComunidades.metadata, carregar_configuracao().comunidades_database_url, "alembic_version_comunidades")
