"""Property 18: Token de redefinição é de uso único e só o último vale.

**Validates: Requirements 5.3, 5.6, 5.7, 5.10**

Para qualquer Usuario com Sessoes ativas e qualquer sequência de k ≥ 1 pedidos
de redefinição, só o token do último pedido é aceito. Uma confirmação com senha
fora de 8–128 responde 400 ``senha_invalida`` sem consumir o token. A
confirmação com senha válida responde 204, todas as Sessoes do Usuario ficam
inválidas e o login funciona só com a nova senha. Depois disso, reutilizar o
mesmo token, usar qualquer token anterior, usar um token aleatório ou usar um
token após ``expira_em`` responde 400 ``token_invalido`` sem mudar o Hash_Senha.

O token em texto claro é capturado trocando ``app.core.seguranca.gerar_token``
por um invólucro que anota cada valor gerado (o serviço chama o gerador pelo
atributo do módulo). O relógio da app é o ``RelogioControlado``; a fronteira de
30 minutos é testada em ``test_expiracao_do_token_na_fronteira_de_30_minutos``:
exatamente 30 min depois do pedido o token é inválido, um instante antes ainda
vale.

Cada exemplo roda sobre uma cópia própria do banco-modelo.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st
from sqlalchemy import select

from app.autenticacao.modelo import Sessao, TokenRedefinicao, Usuario
from app.autenticacao.servico import criar_usuario, validar_sessao
from app.core import seguranca
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import (
    emails_normalizados,
    senhas_invalidas,
    senhas_validas,
    tokens_aleatorios,
)

URL_LOGIN = "/api/v1/auth/login"
URL_PEDIDO = "/api/v1/auth/redefinicao-senha"
URL_CONFIRMACAO = "/api/v1/auth/redefinicao-senha/confirmacao"

VALIDADE = timedelta(minutes=30)
UM_US = timedelta(microseconds=1)

# Intervalo entre pedidos consecutivos e entre o último pedido e a confirmação
# (sempre antes dos 30 minutos de validade do último token).
_intervalos = st.integers(min_value=0, max_value=10 * 60 * 10**6).map(
    lambda us: timedelta(microseconds=us)
)
_antes_de_expirar = st.one_of(
    st.sampled_from([timedelta(0), VALIDADE - UM_US]),
    st.integers(min_value=0, max_value=int(VALIDADE / UM_US) - 1).map(
        lambda us: timedelta(microseconds=us)
    ),
)
# Quanto antes dos 30 min fica o instante "um pouco antes" (de 1 µs a 30 min).
_folga_antes = st.one_of(
    st.sampled_from([UM_US, timedelta(milliseconds=1), timedelta(seconds=1)]),
    st.integers(min_value=1, max_value=int(VALIDADE / UM_US)).map(
        lambda us: timedelta(microseconds=us)
    ),
)
# Quanto depois dos 30 min (0 = exatamente na fronteira).
_atraso_depois = st.one_of(
    st.just(timedelta(0)),
    st.just(UM_US),
    st.timedeltas(min_value=timedelta(0), max_value=timedelta(days=2)),
)


class _Capturador:
    """Invólucro de ``gerar_token`` que guarda cada token gerado, em ordem."""

    def __init__(self, original: Callable[[], str]) -> None:
        self._original = original
        self.gerados: list[str] = []

    def __call__(self) -> str:
        token = self._original()
        self.gerados.append(token)
        return token


def _pedir_e_capturar(ctx, capturador: _Capturador, email: str) -> str:
    """``POST /auth/redefinicao-senha`` e devolve o token criado por ele."""
    antes = len(capturador.gerados)
    resposta = ctx.cliente.post(URL_PEDIDO, json={"email": email})
    assert resposta.status_code == 202, resposta.text
    novos = capturador.gerados[antes:]
    assert novos, "o pedido para um e-mail cadastrado não gerou token"
    # Só há mais de um em caso de colisão de token_hash; o último é o gravado.
    return novos[-1]


def _confirmar(ctx, token: str, senha: str):
    return ctx.cliente.post(URL_CONFIRMACAO, json={"token": token, "newPassword": senha})


def _codigo(resposta) -> str:
    return resposta.json()["error"]["code"]


def _assert_token_invalido(resposta, contexto) -> None:
    assert resposta.status_code == 400, (contexto, resposta.text)
    assert _codigo(resposta) == "token_invalido", (contexto, resposta.text)


def _hash_senha(ctx, usuario_id: str) -> str:
    with ctx.sessao() as db:
        return db.get(Usuario, usuario_id).hash_senha


def _logar(ctx, email: str, senha: str):
    return ctx.cliente.post(URL_LOGIN, json={"email": email, "password": senha})


@settings(max_examples=100, deadline=None)
@given(
    email=emails_normalizados(),
    senha_inicial=senhas_validas(),
    nova_senha=senhas_validas(),
    senha_ruim=senhas_invalidas(),
    n_sessoes=st.integers(min_value=1, max_value=3),
    intervalos=st.lists(_intervalos, min_size=1, max_size=4),
    ate_confirmar=_antes_de_expirar,
    tokens_falsos=st.lists(tokens_aleatorios(), min_size=1, max_size=3),
)
def test_token_de_redefinicao_e_de_uso_unico_e_so_o_ultimo_vale(
    criar_app_isolada,
    email,
    senha_inicial,
    nova_senha,
    senha_ruim,
    n_sessoes,
    intervalos,
    ate_confirmar,
    tokens_falsos,
):
    assume(nova_senha != senha_inicial)
    k = len(intervalos)

    with criar_app_isolada() as ctx, pytest.MonkeyPatch.context() as mp:
        capturador = _Capturador(seguranca.gerar_token)
        mp.setattr(seguranca, "gerar_token", capturador)

        with ctx.sessao() as db:
            usuario = criar_usuario(db, "Ana", email, senha_inicial, INSTANTE_INICIAL)
            usuario_id = usuario.id
        # Sessão do banco fechada antes de chamar a API.

        tokens_sessao = []
        for _ in range(n_sessoes):
            resposta = _logar(ctx, email, senha_inicial)
            assert resposta.status_code == 200, resposta.text
            tokens_sessao.append(resposta.json()["token"])

        # k pedidos; cada um deve invalidar o anterior (5.3).
        tokens = []
        for intervalo in intervalos:
            ctx.relogio.avancar(intervalo)
            tokens.append(_pedir_e_capturar(ctx, capturador, email))
        assert len(set(tokens)) == k
        ultimo, anteriores = tokens[-1], tokens[:-1]
        instante_ultimo = ctx.relogio.agora()

        agora = ctx.relogio.avancar(ate_confirmar)
        hash_original = _hash_senha(ctx, usuario_id)

        # Só hash no banco; os anteriores estão invalidados e o último está ativo.
        with ctx.sessao() as db:
            registros = db.scalars(
                select(TokenRedefinicao)
                .where(TokenRedefinicao.usuario_id == usuario_id)
                .order_by(TokenRedefinicao.criado_em, TokenRedefinicao.id)
            ).all()
            por_hash = {r.token_hash: r for r in registros}
            assert len(registros) == k
            assert set(por_hash) == {seguranca.hash_token(t) for t in tokens}
            r_ultimo = por_hash[seguranca.hash_token(ultimo)]
            assert r_ultimo.criado_em == instante_ultimo
            assert r_ultimo.expira_em == instante_ultimo + VALIDADE
            assert r_ultimo.usado_em is None and r_ultimo.invalidado_em is None
            for anterior in anteriores:
                r = por_hash[seguranca.hash_token(anterior)]
                assert r.invalidado_em is not None and r.usado_em is None

        # Tokens anteriores e aleatórios: 400 token_invalido, mesmo com senha válida
        # e com precedência sobre a senha inválida (5.7).
        falsos = [t for t in tokens_falsos if t not in tokens]
        for token in [*anteriores, *falsos]:
            for senha in (nova_senha, senha_ruim):
                _assert_token_invalido(_confirmar(ctx, token, senha), ("antes", token, senha))
        assert _hash_senha(ctx, usuario_id) == hash_original

        # Senha fora de 8–128 com o último token: 400 senha_invalida sem consumi-lo (5.10).
        resposta = _confirmar(ctx, ultimo, senha_ruim)
        assert resposta.status_code == 400, resposta.text
        assert _codigo(resposta) == "senha_invalida", resposta.text
        assert _hash_senha(ctx, usuario_id) == hash_original
        with ctx.sessao() as db:
            r = db.scalars(
                select(TokenRedefinicao).where(
                    TokenRedefinicao.token_hash == seguranca.hash_token(ultimo)
                )
            ).one()
            assert r.usado_em is None and r.invalidado_em is None
            for token_sessao in tokens_sessao:
                assert validar_sessao(db, token_sessao, agora) is not None

        # Senha válida com o último token: 204, senha trocada, token usado e
        # todas as Sessoes do Usuario revogadas (5.6).
        resposta = _confirmar(ctx, ultimo, nova_senha)
        assert resposta.status_code == 204, resposta.text
        assert resposta.content == b""
        hash_novo = _hash_senha(ctx, usuario_id)
        assert hash_novo != hash_original
        assert seguranca.verificar_senha(hash_novo, nova_senha)
        with ctx.sessao() as db:
            r = db.scalars(
                select(TokenRedefinicao).where(
                    TokenRedefinicao.token_hash == seguranca.hash_token(ultimo)
                )
            ).one()
            assert r.usado_em == agora
            sessoes = db.scalars(select(Sessao).where(Sessao.usuario_id == usuario_id)).all()
            assert len(sessoes) == n_sessoes
            assert all(s.revogada_em == agora for s in sessoes)
            for token_sessao in tokens_sessao:
                assert validar_sessao(db, token_sessao, agora) is None

        # Login só com a nova senha.
        resposta = _logar(ctx, email, senha_inicial)
        assert resposta.status_code == 401, resposta.text
        resposta = _logar(ctx, email, nova_senha)
        assert resposta.status_code == 200, resposta.text

        # Depois do sucesso: reutilizar o token, usar os anteriores ou aleatórios
        # responde token_invalido sem mudar o Hash_Senha (5.7).
        for token in [ultimo, *anteriores, *falsos]:
            for senha in (senha_inicial, senha_ruim):
                _assert_token_invalido(_confirmar(ctx, token, senha), ("depois", token, senha))
        assert _hash_senha(ctx, usuario_id) == hash_novo

        # Um novo pedido depois do sucesso, usado após expira_em: token_invalido.
        ctx.relogio.avancar(timedelta(seconds=1))
        tardio = _pedir_e_capturar(ctx, capturador, email)
        ctx.relogio.avancar(VALIDADE)
        _assert_token_invalido(_confirmar(ctx, tardio, senha_inicial), ("expirado", tardio))
        assert _hash_senha(ctx, usuario_id) == hash_novo
        assert _logar(ctx, email, nova_senha).status_code == 200


@settings(max_examples=100, deadline=None)
@given(
    email=emails_normalizados(),
    senha_inicial=senhas_validas(),
    nova_senha=senhas_validas(),
    senha_ruim=senhas_invalidas(),
    espera_pedido=st.timedeltas(min_value=timedelta(0), max_value=timedelta(days=3)),
    folga_antes=_folga_antes,
    atraso_depois=_atraso_depois,
)
def test_expiracao_do_token_na_fronteira_de_30_minutos(
    criar_app_isolada,
    email,
    senha_inicial,
    nova_senha,
    senha_ruim,
    espera_pedido,
    folga_antes,
    atraso_depois,
):
    assume(nova_senha != senha_inicial)

    with criar_app_isolada() as ctx, pytest.MonkeyPatch.context() as mp:
        capturador = _Capturador(seguranca.gerar_token)
        mp.setattr(seguranca, "gerar_token", capturador)

        with ctx.sessao() as db:
            usuario = criar_usuario(db, "Ana", email, senha_inicial, INSTANTE_INICIAL)
            usuario_id = usuario.id

        resposta = _logar(ctx, email, senha_inicial)
        assert resposta.status_code == 200, resposta.text
        token_sessao = resposta.json()["token"]

        criado_em = ctx.relogio.avancar(espera_pedido)
        token = _pedir_e_capturar(ctx, capturador, email)
        hash_original = _hash_senha(ctx, usuario_id)
        expira_em = criado_em + VALIDADE

        # Um instante antes dos 30 min o token ainda vale: a senha inválida é a
        # que responde (senha_invalida), e o token não é consumido.
        antes = ctx.relogio.definir(expira_em - folga_antes)
        resposta = _confirmar(ctx, token, senha_ruim)
        assert resposta.status_code == 400, resposta.text
        assert _codigo(resposta) == "senha_invalida", (antes, resposta.text)

        # Exatamente nos 30 min (ou depois) o token é inválido, com qualquer senha.
        depois = ctx.relogio.definir(expira_em + atraso_depois)
        for senha in (nova_senha, senha_ruim):
            _assert_token_invalido(_confirmar(ctx, token, senha), (depois, senha))
        assert _hash_senha(ctx, usuario_id) == hash_original
        with ctx.sessao() as db:
            sessao = db.scalars(select(Sessao).where(Sessao.usuario_id == usuario_id)).one()
            assert sessao.revogada_em is None
            r = db.scalars(select(TokenRedefinicao)).one()
            assert r.expira_em == expira_em
            assert r.usado_em is None
        assert _logar(ctx, email, senha_inicial).status_code == 200

        # De volta a um instante antes dos 30 min: as tentativas expiradas não
        # consumiram o token, e a confirmação com senha válida dá certo.
        ctx.relogio.definir(antes)
        resposta = _confirmar(ctx, token, nova_senha)
        assert resposta.status_code == 204, resposta.text
        assert _hash_senha(ctx, usuario_id) != hash_original
        with ctx.sessao() as db:
            assert validar_sessao(db, token_sessao, antes) is None
        assert _logar(ctx, email, nova_senha).status_code == 200
        assert _logar(ctx, email, senha_inicial).status_code == 401
