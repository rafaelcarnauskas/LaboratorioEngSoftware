"""Engine e sessões do banco para a Parte 1 (autenticação e conta).

Uso esperado em `create_app()`:

    engine = criar_engine(config.database_url)
    app.state.session_local = criar_session_local(engine)

Cada app (inclusive as criadas nos testes, uma por arquivo SQLite) guarda a
própria fábrica em `app.state.session_local`; `obter_db()` lê dali.
Nenhuma tabela é criada aqui: o esquema vem só do Alembic (Requisito 13.8).
"""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import base

# Fábrica sem engine; `criar_session_local` devolve uma cópia ligada a um engine.
SessionLocal = sessionmaker()


def _ativar_foreign_keys(conexao_dbapi, _registro):
    cursor = conexao_dbapi.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def criar_engine(url: str | None = None) -> Engine:
    """Cria o engine reaproveitando `app.db.base.criar_engine`.

    Para SQLite (`check_same_thread=False` já vem da base) liga
    `PRAGMA foreign_keys=ON` em cada conexão nova.
    """
    engine = base.criar_engine(url)
    if engine.dialect.name == "sqlite":
        event.listen(engine, "connect", _ativar_foreign_keys)
    return engine


def criar_session_local(engine: Engine) -> sessionmaker:
    """Devolve uma fábrica de `Session` ligada ao engine (mesma configuração de `SessionLocal`)."""
    return sessionmaker(**{**SessionLocal.kw, "bind": engine})


def obter_db(request: Request) -> Iterator[Session]:
    """Dependência FastAPI: uma `Session` por requisição, fechada no fim."""
    fabrica = getattr(request.app.state, "session_local", None)
    if fabrica is None:
        raise RuntimeError("app.state.session_local não configurado; use criar_session_local(engine) em create_app()")
    db = fabrica()
    try:
        yield db
    finally:
        db.close()
