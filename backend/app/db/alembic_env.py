"""Corpo comum dos ``env.py`` do Alembic (um ambiente por banco).

Cada banco tem o próprio diretório de migrations e a própria seção no
``alembic.ini`` (``alembic -n <secao> upgrade head``). O ``env.py`` de cada um só
chama :func:`rodar` com o metadata do serviço, a URL do banco e o nome da tabela
de versão.

A tabela de versão tem um nome por banco (``alembic_version_<servico>``). Assim
dois serviços podem dividir o mesmo servidor PostgreSQL com bancos (ou schemas)
diferentes sem confusão. Com ``?options=-csearch_path%3D<schema>`` na URL, o
schema é criado antes das migrations.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool


def _schema_da_url(url: str) -> str | None:
    opcoes = make_url(url).query.get("options")
    if isinstance(opcoes, tuple):
        opcoes = " ".join(opcoes)
    for parte in (opcoes or "").split():
        if parte.startswith("-csearch_path="):
            return parte.split("=", 1)[1].split(",")[0].strip() or None
    return None


def rodar(metadata, url: str, tabela_versao: str) -> None:
    config = context.config
    # disable_existing_loggers=False: não silenciar os loggers da aplicação.
    if config.config_file_name is not None:
        fileConfig(config.config_file_name, disable_existing_loggers=False)

    tabelas = frozenset(metadata.tables)

    def incluir_nome(nome, tipo, _pais):
        return nome in tabelas if tipo == "table" else True

    def incluir_objeto(objeto, nome, tipo, _refletido, _comparar_com):
        if tipo == "table":
            return nome in tabelas
        tabela = getattr(objeto, "table", None)
        return tabela.name in tabelas if tabela is not None else True

    opcoes = {
        "target_metadata": metadata,
        "version_table": tabela_versao,
        # SQLite não tem ALTER TABLE completo: o modo batch recria a tabela.
        "render_as_batch": True,
        "include_name": incluir_nome,
        "include_object": incluir_objeto,
        "compare_type": True,
    }

    if context.is_offline_mode():
        context.configure(url=url, literal_binds=True, dialect_opts={"paramstyle": "named"}, **opcoes)
        with context.begin_transaction():
            context.run_migrations()
        return

    engine = create_engine(url, poolclass=NullPool)
    try:
        schema = _schema_da_url(url) if engine.dialect.name == "postgresql" else None
        if schema:
            with engine.begin() as conexao:
                conexao.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        with engine.connect() as conexao:
            context.configure(connection=conexao, **opcoes)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
