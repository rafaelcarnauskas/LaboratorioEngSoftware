"""Property 17: Pedido de redefinição não revela se o e-mail existe.

**Validates: Requirements 5.2**

Para qualquer e-mail válido, cadastrado ou não, ``POST /api/v1/auth/redefinicao-senha``
responde 202 com corpo idêntico byte a byte ao de qualquer outro e-mail válido,
sem o Token_Redefinicao nem dados do Usuario.

Cada exemplo roda sobre uma cópia própria do banco-modelo, em ``development``
(onde o token aparece no log, então dá para conferir que ele não está no corpo)
ou em ``test``. O log de ``choosen.autenticacao`` é capturado por um handler
local, instalado dentro do corpo do teste (o ``caplog`` não reinicia por
exemplo do Hypothesis).
"""

from __future__ import annotations

import logging
import re
from contextlib import contextmanager

from hypothesis import assume, given, settings
from hypothesis import strategies as st
from sqlalchemy import func, select

from app.autenticacao.api import MSG_PEDIDO_REDEFINICAO
from app.autenticacao.modelo import TokenRedefinicao
from app.autenticacao.servico import criar_usuario
from app.core import seguranca
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import emails_normalizados, senhas_validas, variacoes_de_email

URL_PEDIDO = "/api/v1/auth/redefinicao-senha"
NOME_LOGGER = "choosen.autenticacao"
_TOKEN_NO_LOG = re.compile(r"Token: ([A-Za-z0-9_-]+)")


class _Coletor(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.NOTSET)
        self.registros: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.registros.append(record)


@contextmanager
def _capturar_log():
    """Anexa um coletor a ``choosen.autenticacao`` (com nível INFO) e restaura ao sair."""
    logger = logging.getLogger(NOME_LOGGER)
    coletor = _Coletor()
    nivel_anterior = logger.level
    logger.setLevel(logging.INFO)
    logger.addHandler(coletor)
    try:
        yield coletor
    finally:
        logger.removeHandler(coletor)
        logger.setLevel(nivel_anterior)


def _hashes_tokens(ctx) -> set[str]:
    with ctx.sessao() as db:
        return set(db.scalars(select(TokenRedefinicao.token_hash)))


def _contar_tokens(ctx) -> int:
    with ctx.sessao() as db:
        return db.scalar(select(func.count()).select_from(TokenRedefinicao))


def _assert_202_fixo(resposta) -> None:
    assert resposta.status_code == 202, resposta.text
    # Igualdade exata: só a mensagem fixa, sem token nem dados do Usuario.
    assert resposta.json() == {"message": MSG_PEDIDO_REDEFINICAO}


@st.composite
def _cenario(draw):
    email = draw(emails_normalizados())
    desconhecido = draw(emails_normalizados())
    assume(desconhecido != email)
    return {
        "ambiente": draw(st.sampled_from(["development", "test"])),
        "email": email,
        "senha": draw(senhas_validas()),
        "pedido_cadastrado": draw(variacoes_de_email(email)),
        "pedido_desconhecido": draw(variacoes_de_email(desconhecido)),
        "cadastrado_primeiro": draw(st.booleans()),
    }


@settings(max_examples=100, deadline=None)
@given(c=_cenario())
def test_pedido_de_redefinicao_nao_revela_se_o_email_existe(criar_app_isolada, c):
    with criar_app_isolada(ambiente={"CHOOSEN_ENV": c["ambiente"]}) as ctx:
        with ctx.sessao() as db:
            criar_usuario(db, "Ana", c["email"], c["senha"], INSTANTE_INICIAL)
        assert _contar_tokens(ctx) == 0

        with _capturar_log() as coletor:
            ordem = ["cadastrado", "desconhecido"]
            if not c["cadastrado_primeiro"]:
                ordem.reverse()
            respostas = {}
            for tipo in ordem:
                respostas[tipo] = ctx.cliente.post(
                    URL_PEDIDO, json={"email": c[f"pedido_{tipo}"]}
                )

        r_cadastrado = respostas["cadastrado"]
        r_desconhecido = respostas["desconhecido"]
        _assert_202_fixo(r_cadastrado)
        _assert_202_fixo(r_desconhecido)
        assert r_cadastrado.content == r_desconhecido.content

        # Só o pedido do e-mail cadastrado gravou algo (um TokenRedefinicao).
        hashes = _hashes_tokens(ctx)
        assert len(hashes) == 1

        mensagens = [r.getMessage() for r in coletor.registros]
        if c["ambiente"] == "development":
            tokens = [m.group(1) for msg in mensagens for m in _TOKEN_NO_LOG.finditer(msg)]
            assert len(tokens) == 1, mensagens
            token = tokens[0]
            # É o token real (o hash dele está gravado) e não aparece em resposta nenhuma.
            assert seguranca.hash_token(token) in hashes
            for resposta in (r_cadastrado, r_desconhecido):
                assert token not in resposta.text
                assert token not in "".join(f"{k}:{v}" for k, v in resposta.headers.items())
        else:
            assert not any("Token:" in msg for msg in mensagens), mensagens
