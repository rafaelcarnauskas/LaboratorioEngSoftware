"""Property 9: Falha de login não revela a causa e não cria sessão.

**Validates: Requirements 3.4, 3.8**

- Para qualquer par (e-mail válido não cadastrado, senha não vazia) e qualquer
  par (e-mail cadastrado, senha diferente da correta), ``POST /api/v1/auth/login``
  responde 401 ``credenciais_invalidas`` nos dois casos, com corpos idênticos
  byte a byte, sem Token_Sessao, e o número de Sessoes persistidas não muda.
- Para qualquer string que não é Email_Valido (e qualquer senha), o login
  responde 422 ``validacao`` sem consultar o Servico_Usuario
  (``buscar_usuario``) e sem criar Sessao. O mesmo vale para um e-mail
  cadastrado com senha vazia.

Cada exemplo roda sobre uma cópia própria do banco-modelo. O banco começa com
um Usuario cadastrado e uma Sessao já existente, para que "não muda" seja
conferido contra uma contagem diferente de zero.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st
from sqlalchemy import func, select

from app.autenticacao import servico
from app.autenticacao.modelo import Sessao
from app.autenticacao.servico import criar_sessao, criar_usuario
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import (
    emails_invalidos,
    emails_normalizados,
    senhas,
    senhas_validas,
    variacoes_de_email,
)

URL_LOGIN = "/api/v1/auth/login"
TTL_MINUTOS = 60


def _contar_sessoes(ctx) -> int:
    with ctx.sessao() as db:
        return db.scalar(select(func.count()).select_from(Sessao))


def _preparar(ctx, email: str, senha: str) -> int:
    """Cadastra o Usuario, cria uma Sessao prévia e devolve a contagem inicial."""
    with ctx.sessao() as db:
        usuario = criar_usuario(db, "Ana", email, senha, INSTANTE_INICIAL)
        criar_sessao(db, usuario, INSTANTE_INICIAL, TTL_MINUTOS)
    total = _contar_sessoes(ctx)
    assert total == 1
    return total


@contextmanager
def _espiar_buscar_usuario():
    """Registra as chamadas a ``servico.buscar_usuario`` sem mudar o resultado."""
    chamadas: list[str] = []
    original = servico.buscar_usuario

    def espiao(db, email):
        chamadas.append(email)
        return original(db, email)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(servico, "buscar_usuario", espiao)
        yield chamadas


def _assert_401_credenciais(resposta) -> None:
    assert resposta.status_code == 401, resposta.text
    corpo = resposta.json()
    assert corpo["error"]["code"] == "credenciais_invalidas"
    assert "token" not in corpo
    assert "user" not in corpo


# --- 401: e-mail desconhecido e senha errada são indistinguíveis -------------


@st.composite
def _cenario_401(draw):
    email = draw(emails_normalizados())
    senha = draw(senhas_validas())
    senha_errada = draw(senhas().filter(lambda s: s != ""))
    assume(senha_errada != senha)
    desconhecido = draw(emails_normalizados())
    assume(desconhecido != email)
    senha_desconhecido = draw(senhas().filter(lambda s: s != ""))
    return {
        "email": email,
        "senha": senha,
        "login_senha_errada": draw(variacoes_de_email(email)),
        "senha_errada": senha_errada,
        "login_desconhecido": draw(variacoes_de_email(desconhecido)),
        "senha_desconhecido": senha_desconhecido,
    }


@settings(max_examples=100, deadline=None)
@given(c=_cenario_401())
def test_falha_de_login_nao_revela_a_causa(criar_app_isolada, c):
    with criar_app_isolada() as ctx:
        antes = _preparar(ctx, c["email"], c["senha"])

        r_desconhecido = ctx.cliente.post(
            URL_LOGIN,
            json={"email": c["login_desconhecido"], "password": c["senha_desconhecido"]},
        )
        r_senha_errada = ctx.cliente.post(
            URL_LOGIN,
            json={"email": c["login_senha_errada"], "password": c["senha_errada"]},
        )

        _assert_401_credenciais(r_desconhecido)
        _assert_401_credenciais(r_senha_errada)
        assert r_desconhecido.content == r_senha_errada.content
        assert _contar_sessoes(ctx) == antes


# --- 422: e-mail inválido (ou senha vazia) antes de qualquer consulta --------


@st.composite
def _cenario_422(draw):
    email = draw(emails_normalizados())
    senha = draw(senhas_validas())
    if draw(st.booleans()):
        pedido = {"email": draw(emails_invalidos()), "password": draw(senhas())}
    else:
        pedido = {"email": draw(variacoes_de_email(email)), "password": ""}
    return email, senha, pedido


@settings(max_examples=100, deadline=None)
@given(cenario=_cenario_422())
def test_login_com_email_invalido_responde_422_sem_consultar(criar_app_isolada, cenario):
    email, senha, pedido = cenario
    with criar_app_isolada() as ctx:
        antes = _preparar(ctx, email, senha)

        with _espiar_buscar_usuario() as chamadas:
            resposta = ctx.cliente.post(URL_LOGIN, json=pedido)

        assert resposta.status_code == 422, resposta.text
        corpo = resposta.json()
        assert corpo["error"]["code"] == "validacao"
        assert "token" not in corpo
        assert chamadas == [], f"buscar_usuario consultado com {chamadas!r}"
        assert _contar_sessoes(ctx) == antes
