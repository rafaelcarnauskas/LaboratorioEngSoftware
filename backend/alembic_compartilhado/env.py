"""Ambiente do Alembic do banco compartilhado (``choosen_compartilhado``).

Rode a partir de backend/: ``alembic -n compartilhado upgrade head``. A URL vem de
CHOOSEN_SHARED_DATABASE_URL e só a infraestrutura a conhece.
"""

from app.core.config import carregar_configuracao
from app.db.alembic_env import rodar
from app.infraestrutura.modelo import BaseCompartilhado

rodar(BaseCompartilhado.metadata, carregar_configuracao().url_compartilhada,
      "alembic_version_compartilhado")
