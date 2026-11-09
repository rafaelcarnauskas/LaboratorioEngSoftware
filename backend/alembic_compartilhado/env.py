"""Ambiente do Alembic do banco compartilhado entre os microserviços.

Rode a partir de backend/: alembic -n compartilhado upgrade head

A URL vem de `carregar_configuracao().url_compartilhada`
(CHOOSEN_SHARED_DATABASE_URL; sem ela, a mesma URL do banco próprio). A versão
fica em `alembic_version_compartilhado`, para conviver com a `alembic_version`
do banco próprio quando as duas URLs são iguais.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from app.autenticacao.modelo_compartilhado import BaseCompartilhado
from app.core.config import carregar_configuracao

config = context.config

# disable_existing_loggers=False: não silenciar os loggers da aplicação.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = BaseCompartilhado.metadata

TABELA_VERSAO = "alembic_version_compartilhado"

# Só as tabelas do banco compartilhado. Quando as URLs são iguais, o mesmo banco
# tem as tabelas do banco próprio e as dos colegas, que este ambiente ignora.
TABELAS_GERIDAS = frozenset(target_metadata.tables)


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
        "version_table": TABELA_VERSAO,
        # SQLite não tem ALTER TABLE completo: o modo batch recria a tabela.
        "render_as_batch": True,
        "include_name": incluir_nome,
        "include_object": incluir_objeto,
        "compare_type": True,
    }


def run_migrations_offline() -> None:
    """Gera o SQL sem conectar (alembic -n compartilhado upgrade head --sql)."""
    context.configure(
        url=carregar_configuracao().url_compartilhada,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_opcoes_comuns(),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Conecta ao banco compartilhado e aplica as migrations."""
    engine = create_engine(carregar_configuracao().url_compartilhada, poolclass=NullPool)
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
