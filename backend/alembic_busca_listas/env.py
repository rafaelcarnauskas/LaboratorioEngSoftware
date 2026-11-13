"""Ambiente do Alembic do banco próprio choosen_busca_listas.

Rode a partir de backend/: ``alembic -n busca_listas upgrade head``. A URL vem de CHOOSEN_BUSCA_LISTAS_DATABASE_URL.
"""

from app.core.config import carregar_configuracao
from app.db.alembic_env import rodar
from app.busca_listas.modelo import BaseBuscaListas

rodar(BaseBuscaListas.metadata, carregar_configuracao().busca_listas_database_url, "alembic_version_busca_listas")
