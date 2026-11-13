"""Aplica as migrations de todos os bancos e registra os serviços na infraestrutura.

Uso, em ``backend/``::

    python -m app.db.migrar

Equivale a rodar, nesta ordem::

    alembic upgrade head                    # choosen_autenticacao
    alembic -n compartilhado upgrade head   # choosen_compartilhado
    alembic -n comunidades upgrade head     # choosen_comunidades
    alembic -n videos upgrade head          # choosen_videos
    alembic -n busca_listas upgrade head    # choosen_busca_listas
    alembic -n historico upgrade head       # choosen_historico

e depois grava ``servico``, ``permissao`` e ``assinatura`` e republica os perfis
em ``usuario_publico``. Cada banco usa a própria variável de ambiente (veja o
README do backend).
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from alembic import command
    from alembic.config import Config
except ImportError:  # sem o pacote, o Python acha a pasta backend/alembic no lugar dele
    sys.exit("O pacote alembic não está instalado neste Python. Ative o .venv e rode "
             "`pip install -r backend/requirements.txt` (na raiz do repositório).")

from app.autenticacao import republicar

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"
SECOES = ("alembic", "compartilhado", "comunidades", "videos", "busca_listas", "historico")


def migrar() -> None:
    for secao in SECOES:
        command.upgrade(Config(str(ALEMBIC_INI), ini_section=secao), "head")


def main() -> int:
    try:
        migrar()
    except SystemExit as erro:  # configuração inválida
        print(str(erro.code), file=sys.stderr)
        return 1
    # Registra serviços/permissões e preenche usuario_publico a partir da autenticação.
    return republicar.main()


if __name__ == "__main__":
    sys.exit(main())
