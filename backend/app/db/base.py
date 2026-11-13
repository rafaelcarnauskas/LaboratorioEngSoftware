"""Tipos de coluna e criação de engines usados por todos os bancos do Choosen.

Cada microserviço declara as próprias tabelas num ``DeclarativeBase`` separado
(por exemplo ``BaseComunidades``); este módulo não tem um ``Base`` comum, para
que nenhuma tabela de um serviço vá parar no banco de outro.

Tipos usados no modelo de dados (PostgreSQL; SQLite só no desenvolvimento local):

- :data:`UUID` → ``uuid`` no PostgreSQL. Na aplicação o valor é ``str`` (UUID com hífens).
- :class:`DataHoraTZ` → ``timestamptz`` no PostgreSQL, sempre em UTC.
- :data:`JSONB` → ``jsonb`` no PostgreSQL (``JSON`` no SQLite).
- :class:`DataHoraUTC` → ``timestamp`` sem fuso, gravado em UTC. Só as tabelas da
  autenticação criadas pela migration ``0001`` usam este tipo.
"""

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Uuid, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

UUID = Uuid(as_uuid=False)
JSONB = JSON().with_variant(postgresql.JSONB(), "postgresql")


def _exigir_fuso(value) -> datetime:
    if not isinstance(value, datetime):
        raise TypeError(f"Esperava datetime, recebeu {type(value).__name__}")
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Data e hora sem fuso não são aceitas; use datetime com tzinfo")
    return value.astimezone(UTC)


def _ler_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class DataHoraUTC(TypeDecorator):
    """Data e hora sempre em UTC, numa coluna sem fuso.

    O SQLite não guarda fuso: a coluna grava o instante em UTC sem fuso e a
    leitura devolve `datetime` com `tzinfo=UTC`. Gravar um `datetime` sem fuso
    lança `ValueError`, para não misturar horários locais com UTC.
    """

    impl = DateTime(timezone=False)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return _exigir_fuso(value).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return _ler_utc(value)


class DataHoraTZ(TypeDecorator):
    """``timestamptz`` no PostgreSQL; no SQLite, o instante em UTC sem fuso.

    Nos dois casos a leitura devolve `datetime` com `tzinfo=UTC`, e gravar um
    `datetime` sem fuso lança `ValueError`.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        valor = _exigir_fuso(value)
        return valor.replace(tzinfo=None) if dialect.name == "sqlite" else valor

    def process_result_value(self, value, dialect):
        return _ler_utc(value)


# O Render entrega postgres:// ou postgresql://; o SQLAlchemy precisa do driver psycopg explícito.
def normalizar_url_postgres(url):
    for prefixo in ("postgres://", "postgresql://"):
        if url.startswith(prefixo):
            return "postgresql+psycopg://" + url[len(prefixo):]
    return url


def criar_engine(url):
    url = normalizar_url_postgres(url)
    if url.startswith("sqlite"):
        extra = {"poolclass": StaticPool} if url in ("sqlite://", "sqlite:///:memory:") else {}
        return create_engine(url, connect_args={"check_same_thread": False}, **extra)
    return create_engine(url, pool_pre_ping=True)
