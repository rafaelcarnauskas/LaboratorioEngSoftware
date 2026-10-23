"""Ambiente do Alembic: única forma de criar ou alterar o esquema (Requisito 13.8).

A URL vem de `carregar_configuracao().database_url`, a mesma usada pelo Backend.
Com SQLite em arquivo, o arquivo é criado na primeira conexão do
`alembic upgrade head` quando ainda não existe (Requisito 13.2).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

import app.autenticacao.modelo as modelo_autenticacao
from app.core.config import carregar_configuracao
from app.db.base import Base

config = context.config

# disable_existing_loggers=False: rodar as migrations dentro dos testes não pode
# silenciar os loggers da aplicação (por exemplo, o log da redefinição de senha).
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# O `Base` é compartilhado com outras partes do projeto: o `historico` registra
# `historico_visualizacoes` e `historico_preferencias` e as cria por conta própria
# com `create_all`. Sem este filtro, um `alembic revision --autogenerate` proporia
# criar essas tabelas (quando estão só no metadata) ou removê-las (quando estão
# só no banco). Por isso o Alembic só enxerga as tabelas que ele mesmo gerencia.
# Quando outra parte passar a usar migrations, acrescente as tabelas dela aqui.
TABELAS_GERIDAS = frozenset(
    tabela.__tablename__
    for tabela in (
        modelo_autenticacao.Usuario,
        modelo_autenticacao.Sessao,
        modelo_autenticacao.TokenRedefinicao,
    )
)


def incluir_nome(nome, tipo, _pais):
    """Filtra tabelas refletidas do banco antes da comparação."""
    if tipo == "table":
        return nome in TABELAS_GERIDAS
    return True


def incluir_objeto(objeto, nome, tipo, _refletido, _comparar_com):
    """Filtra tabelas do metadata; índices e colunas seguem a tabela-mãe."""
    if tipo == "table":
        return nome in TABELAS_GERIDAS
    tabela = getattr(objeto, "table", None)
    if tabela is not None:
        return tabela.name in TABELAS_GERIDAS
    return True


def _opcoes_comuns() -> dict:
    return {
        "target_metadata": target_metadata,
        # SQLite não tem ALTER TABLE completo: o modo batch recria a tabela.
        "render_as_batch": True,
        "include_name": incluir_nome,
        "include_object": incluir_objeto,
        "compare_type": True,
    }


def run_migrations_offline() -> None:
    """Gera o SQL sem conectar (alembic upgrade head --sql)."""
    context.configure(
        url=carregar_configuracao().database_url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_opcoes_comuns(),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Conecta ao banco e aplica as migrations."""
    engine = create_engine(carregar_configuracao().database_url, poolclass=NullPool)
    try:
        with engine.connect() as conexao:
            context.configure(connection=conexao, **_opcoes_comuns())
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
