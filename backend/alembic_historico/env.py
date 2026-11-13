"""Ambiente do Alembic do banco próprio choosen_historico.

Rode a partir de backend/: ``alembic -n historico upgrade head``. A URL vem de CHOOSEN_HISTORICO_DATABASE_URL.
"""

from app.core.config import carregar_configuracao
from app.db.alembic_env import rodar
from app.historico.modelo import BaseHistorico

rodar(BaseHistorico.metadata, carregar_configuracao().historico_database_url, "alembic_version_historico")
