import os
from datetime import UTC, datetime

from sqlalchemy import DateTime, create_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class DataHoraUTC(TypeDecorator):
    """Data e hora sempre em UTC.

    O SQLite não guarda fuso: a coluna grava o instante em UTC sem fuso e a
    leitura devolve `datetime` com `tzinfo=UTC`. Gravar um `datetime` sem fuso
    lança `ValueError`, para não misturar horários locais com UTC.
    """

    impl = DateTime(timezone=False)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise TypeError(f"DataHoraUTC espera datetime, recebeu {type(value).__name__}")
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("DataHoraUTC não aceita datetime sem fuso; use datetime com tzinfo")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


# O Render entrega postgres:// ou postgresql://; o SQLAlchemy precisa do driver psycopg explícito.
def normalizar_url_postgres(url):
    for prefixo in ("postgres://", "postgresql://"):
        if url.startswith(prefixo):
            return "postgresql+psycopg://" + url[len(prefixo):]
    return url
# Local: SQLite em arquivo. Render: DATABASE_URL do Postgres.
def database_url():
    return normalizar_url_postgres(os.environ.get("DATABASE_URL", "sqlite:///./choosen.db"))


def criar_engine(url=None):
    url = url or database_url()
    if url.startswith("sqlite"):
        extra = {"poolclass": StaticPool} if url in ("sqlite://", "sqlite:///:memory:") else {}
        return create_engine(url, connect_args={"check_same_thread": False}, **extra)
    return create_engine(url, pool_pre_ping=True)
