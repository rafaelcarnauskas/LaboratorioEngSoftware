import os
import threading

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


# Local: SQLite em arquivo. Render: DATABASE_URL do Postgres.
def database_url():
    url = os.environ.get("DATABASE_URL", "sqlite:///./choosen.db")
    for prefixo in ("postgres://", "postgresql://"):
        if url.startswith(prefixo):
            return "postgresql+psycopg://" + url[len(prefixo):]
    return url


def criar_engine(url=None):
    url = url or database_url()
    if url.startswith("sqlite"):
        extra = {"poolclass": StaticPool} if url in ("sqlite://", "sqlite:///:memory:") else {}
        return create_engine(url, connect_args={"check_same_thread": False}, **extra)
    return create_engine(url, pool_pre_ping=True)


_trava_tabelas = threading.Lock()


# Os repositórios SQL de cada contexto criam suas tabelas no primeiro acesso.
# Requisições simultâneas logo após o servidor subir faziam dois create_all
# concorrerem no mesmo banco ("table ... already exists", erro 500).
def criar_tabelas(engine):
    with _trava_tabelas:
        Base.metadata.create_all(engine)
