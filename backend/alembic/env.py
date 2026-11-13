"""Ambiente do Alembic do banco próprio da autenticação (``choosen_autenticacao``).

Rode a partir de backend/: ``alembic upgrade head`` (ou ``python -m app.db.migrar``,
que aplica as migrations de todos os bancos). A URL vem de
``carregar_configuracao().database_url`` (CHOOSEN_DATABASE_URL), a mesma usada
pelo Backend. A tabela de versão continua ``alembic_version``.
"""

from app.autenticacao.modelo import BaseAutenticacao
from app.core.config import carregar_configuracao
from app.db.alembic_env import rodar

rodar(BaseAutenticacao.metadata, carregar_configuracao().database_url, "alembic_version")
