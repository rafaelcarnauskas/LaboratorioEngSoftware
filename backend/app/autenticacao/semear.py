"""Semeadura do Usuario_Demonstracao (Requisito 14).

Uso, em ``backend/`` e com o esquema já criado por ``alembic upgrade head``::

    python -m app.autenticacao.semear

Só roda com ``CHOOSEN_ENV=development`` (o padrão). Cria o Usuario
``victor@email.com`` ou, se ele já existe (e-mail comparado sem diferenciar
maiúsculas de minúsculas), restaura nome, username, flags de administração e a
senha ``choosen123``, sem duplicar o registro. Descrição, foto, ``criado_em`` e
as Sessoes existentes não são tocados.

Código de saída 0 em sucesso e 1 em qualquer recusa ou falha, com a mensagem
de erro em ``stderr``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import func, inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.autenticacao.modelo import Usuario
from app.autenticacao.servico import (
    CODIGO_FALHA_AO_SALVAR,
    ErroDominio,
    confirmar,
    normalizar_email,
)
from app.core.config import carregar_configuracao
from app.core.relogio import agora_utc
from app.core.seguranca import gerar_hash_senha
from app.db.sessao import criar_engine, criar_session_local

EMAIL_DEMONSTRACAO = "victor@email.com"
NOME_DEMONSTRACAO = "Victor Mendes"
USERNAME_DEMONSTRACAO = "victor"
SENHA_DEMONSTRACAO = "choosen123"

MSG_AMBIENTE_RECUSADO = "A semeadura só é permitida com CHOOSEN_ENV=development."
MSG_CRIADO = "Usuário de demonstração criado."
MSG_RESTAURADO = "Usuário de demonstração restaurado."
MSG_ESQUEMA_AUSENTE = (
    "O banco ainda não tem as tabelas da autenticação. "
    "Rode `alembic upgrade head` em backend/ e tente de novo."
)
MSG_USERNAME_EM_CONFLITO = (
    "Não foi possível semear: o username `victor` já pertence a outra conta "
    "({email}). Renomeie essa conta ou restaure o estado inicial do banco "
    "(veja o README) e rode a semeadura de novo."
)
MSG_EMAIL_DUPLICADO = (
    "Não foi possível semear: há mais de uma conta com o e-mail victor@email.com "
    "(com caixas diferentes). Restaure o estado inicial do banco (veja o README) "
    "e rode a semeadura de novo."
)


class _Recusa(Exception):
    """Motivo para encerrar com código 1 sem alterar nada."""


def _erro(mensagem: str) -> int:
    print(mensagem, file=sys.stderr)
    return 1


def _arquivo_sqlite_ausente(engine: Engine) -> bool:
    """``True`` quando a URL aponta para um arquivo SQLite que não existe.

    Conferido antes de conectar: a conexão criaria um arquivo vazio.
    """
    if engine.dialect.name != "sqlite":
        return False
    caminho = engine.url.database
    if not caminho or caminho == ":memory:" or caminho.startswith("file:"):
        return False
    return not Path(caminho).exists()


def _esquema_pronto(engine: Engine) -> bool:
    if _arquivo_sqlite_ausente(engine):
        return False
    return inspect(engine).has_table(Usuario.__tablename__)


def _semear(db: Session) -> str:
    """Cria ou restaura o Usuario_Demonstracao num único ``commit``; devolve a
    mensagem de sucesso. Lança :class:`_Recusa` antes de escrever qualquer coisa
    quando há conflito."""
    email = normalizar_email(EMAIL_DEMONSTRACAO)
    username_normalizado = USERNAME_DEMONSTRACAO.lower()

    # Sem diferenciar caixa (14.2): uma linha gravada fora do serviço com
    # "Victor@Email.com" também é o Usuario_Demonstracao.
    encontrados = list(
        db.scalars(
            select(Usuario).where(func.lower(func.trim(Usuario.email)) == email)
        )
    )
    if len(encontrados) > 1:
        raise _Recusa(MSG_EMAIL_DUPLICADO)
    usuario = encontrados[0] if encontrados else None

    dono_do_username = db.scalars(
        select(Usuario).where(Usuario.username_normalizado == username_normalizado)
    ).first()
    if dono_do_username is not None and (usuario is None or dono_do_username.id != usuario.id):
        raise _Recusa(MSG_USERNAME_EM_CONFLITO.format(email=dono_do_username.email))

    hash_senha = gerar_hash_senha(SENHA_DEMONSTRACAO)  # só o hash é gravado (14.1)
    agora = agora_utc()

    if usuario is None:
        db.add(
            Usuario(
                email=email,
                username=USERNAME_DEMONSTRACAO,
                username_normalizado=username_normalizado,
                hash_senha=hash_senha,
                nome=NOME_DEMONSTRACAO,
                descricao="",
                foto="",
                is_community_admin=True,
                is_system_admin=True,
                criado_em=agora,
                atualizado_em=agora,
            )
        )
        mensagem = MSG_CRIADO
    else:
        usuario.email = email
        usuario.nome = NOME_DEMONSTRACAO
        usuario.username = USERNAME_DEMONSTRACAO
        usuario.username_normalizado = username_normalizado
        usuario.is_community_admin = True
        usuario.is_system_admin = True
        usuario.hash_senha = hash_senha
        usuario.atualizado_em = agora
        mensagem = MSG_RESTAURADO

    confirmar(db, CODIGO_FALHA_AO_SALVAR)
    return mensagem


def main() -> int:
    """Executa a semeadura; devolve o código de saída do processo."""
    try:
        config = carregar_configuracao()  # lida agora: os testes mudam o ambiente
    except SystemExit as erro:
        return _erro(str(erro.code))

    if config.env != "development":
        return _erro(MSG_AMBIENTE_RECUSADO)  # antes de qualquer conexão (14.4)

    engine = criar_engine(config.database_url)
    try:
        try:
            if not _esquema_pronto(engine):
                return _erro(MSG_ESQUEMA_AUSENTE)
        except SQLAlchemyError as erro:
            return _erro(f"Não foi possível conectar ao banco: {erro.__class__.__name__}.")

        fabrica = criar_session_local(engine)
        with fabrica() as db:
            try:
                mensagem = _semear(db)
            except _Recusa as recusa:
                db.rollback()
                return _erro(str(recusa))
            except ErroDominio as erro:
                return _erro(f"Não foi possível semear: {erro.message}")
            except SQLAlchemyError as erro:
                db.rollback()
                return _erro(f"Não foi possível semear: {erro.__class__.__name__}.")
        print(mensagem)
        return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
