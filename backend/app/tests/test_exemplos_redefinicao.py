"""Testes de exemplo da redefinição de senha (Requisitos 5.2–5.7, 5.10, 16.2, 13.12).

Casos concretos de ``POST /api/v1/auth/redefinicao-senha`` e
``POST /api/v1/auth/redefinicao-senha/confirmacao``. O comportamento geral
(qualquer e-mail, qualquer sequência de pedidos) fica nas Properties 17 e 18;
aqui ficam os cenários fixos: corpo exato do 202, os 30 minutos de validade,
a entrada única de log em ``development`` com o link da Tela_Redefinir_Senha,
a ausência do token em ``test`` e ``production``, e cada resposta da
confirmação.

O token em texto claro é capturado trocando ``app.core.seguranca.gerar_token``
por um invólucro que anota cada valor gerado.
"""

from __future__ import annotations

import logging
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.autenticacao.api import MSG_PEDIDO_REDEFINICAO
from app.autenticacao.modelo import Sessao, TokenRedefinicao, Usuario
from app.autenticacao.servico import VALIDADE_TOKEN_REDEFINICAO, criar_usuario
from app.core import seguranca
from app.tests.conftest import INSTANTE_INICIAL

URL_LOGIN = "/api/v1/auth/login"
URL_PEDIDO = "/api/v1/auth/redefinicao-senha"
URL_CONFIRMACAO = "/api/v1/auth/redefinicao-senha/confirmacao"
NOME_LOGGER = "choosen.autenticacao"

EMAIL = "ana@email.com"
SENHA = "senha-antiga-1"
NOVA_SENHA = "senha-nova-123"
CORPO_202 = {"message": MSG_PEDIDO_REDEFINICAO}


# --- Auxiliares ---------------------------------------------------------------


@pytest.fixture
def tokens_gerados(monkeypatch) -> list[str]:
    """Lista que recebe, em ordem, cada token gerado por ``seguranca.gerar_token``."""
    original = seguranca.gerar_token
    gerados: list[str] = []

    def _capturar() -> str:
        token = original()
        gerados.append(token)
        return token

    monkeypatch.setattr(seguranca, "gerar_token", _capturar)
    return gerados


def _criar_ana(ctx) -> str:
    with ctx.sessao() as db:
        usuario = criar_usuario(db, "Ana", EMAIL, SENHA, INSTANTE_INICIAL)
        return usuario.id


def _pedir(ctx, tokens: list[str], email: str = EMAIL) -> str:
    """Faz o pedido e devolve o token gerado por ele."""
    antes = len(tokens)
    resposta = ctx.cliente.post(URL_PEDIDO, json={"email": email})
    assert resposta.status_code == 202, resposta.text
    assert len(tokens) > antes, "o pedido não gerou token"
    return tokens[-1]


def _confirmar(ctx, token: str, senha: str = NOVA_SENHA):
    return ctx.cliente.post(URL_CONFIRMACAO, json={"token": token, "newPassword": senha})


def _logar(ctx, senha: str) -> str | None:
    resposta = ctx.cliente.post(URL_LOGIN, json={"email": EMAIL, "password": senha})
    return resposta.json()["token"] if resposta.status_code == 200 else None


def _registros_token(ctx, usuario_id: str) -> list[TokenRedefinicao]:
    with ctx.sessao() as db:
        return list(
            db.scalars(
                select(TokenRedefinicao)
                .where(TokenRedefinicao.usuario_id == usuario_id)
                .order_by(TokenRedefinicao.criado_em)
            )
        )


def _hash_senha(ctx, usuario_id: str) -> str:
    with ctx.sessao() as db:
        return db.get(Usuario, usuario_id).hash_senha


def _sessoes(ctx, usuario_id: str) -> list[Sessao]:
    with ctx.sessao() as db:
        return list(db.scalars(select(Sessao).where(Sessao.usuario_id == usuario_id)))


def _assert_erro(resposta, status: int, codigo: str) -> None:
    assert resposta.status_code == status, resposta.text
    assert resposta.json()["error"]["code"] == codigo, resposta.text


def _texto_da_resposta(resposta) -> str:
    cabecalhos = "".join(f"{k}:{v}" for k, v in resposta.headers.items())
    return resposta.text + cabecalhos


# --- Pedido de redefinição ----------------------------------------------------


def test_pedido_responde_202_com_corpo_fixo_para_email_cadastrado_e_desconhecido(
    app_isolada, tokens_gerados
):
    _criar_ana(app_isolada)

    cadastrado = app_isolada.cliente.post(URL_PEDIDO, json={"email": "  ANA@email.com "})
    desconhecido = app_isolada.cliente.post(URL_PEDIDO, json={"email": "ninguem@email.com"})

    for resposta in (cadastrado, desconhecido):
        assert resposta.status_code == 202, resposta.text
        assert resposta.json() == CORPO_202
    assert cadastrado.content == desconhecido.content
    # Só o e-mail cadastrado gerou token, e ele não aparece na resposta.
    assert len(tokens_gerados) == 1
    assert tokens_gerados[0] not in _texto_da_resposta(cadastrado)
    assert EMAIL not in cadastrado.text


def test_pedido_com_email_invalido_responde_422(app_isolada, tokens_gerados):
    _criar_ana(app_isolada)

    resposta = app_isolada.cliente.post(URL_PEDIDO, json={"email": "ana-sem-arroba"})

    _assert_erro(resposta, 422, "validacao")
    assert [c["field"] for c in resposta.json()["error"]["fields"]] == ["email"]
    assert tokens_gerados == []


def test_token_expira_em_30_minutos_e_novo_pedido_invalida_o_anterior(
    app_isolada, tokens_gerados
):
    usuario_id = _criar_ana(app_isolada)
    relogio = app_isolada.relogio

    primeiro = _pedir(app_isolada, tokens_gerados)
    instante_primeiro = relogio.agora()
    relogio.avancar(minutes=5)
    segundo = _pedir(app_isolada, tokens_gerados)
    instante_segundo = relogio.agora()

    assert VALIDADE_TOKEN_REDEFINICAO == timedelta(minutes=30)
    r_primeiro, r_segundo = _registros_token(app_isolada, usuario_id)
    # Só o hash é gravado.
    assert r_primeiro.token_hash == seguranca.hash_token(primeiro)
    assert r_segundo.token_hash == seguranca.hash_token(segundo)
    assert r_primeiro.expira_em == instante_primeiro + timedelta(minutes=30)
    assert r_segundo.expira_em == instante_segundo + timedelta(minutes=30)
    # O anterior foi invalidado pelo novo pedido; o novo está ativo.
    assert r_primeiro.invalidado_em == instante_segundo
    assert r_primeiro.usado_em is None
    assert r_segundo.invalidado_em is None and r_segundo.usado_em is None

    # O primeiro token não serve mais; o segundo sim.
    _assert_erro(_confirmar(app_isolada, primeiro), 400, "token_invalido")
    assert _confirmar(app_isolada, segundo).status_code == 204


def test_em_development_registra_uma_entrada_com_email_token_e_link(
    criar_app_isolada, tokens_gerados, caplog
):
    caplog.set_level(logging.INFO, logger=NOME_LOGGER)
    with criar_app_isolada(ambiente={"CHOOSEN_ENV": "development"}) as ctx:
        assert ctx.config.frontend_url == "http://localhost:5173"
        _criar_ana(ctx)
        caplog.clear()

        resposta = ctx.cliente.post(URL_PEDIDO, json={"email": EMAIL})

    assert resposta.status_code == 202, resposta.text
    assert resposta.json() == CORPO_202
    (token,) = tokens_gerados
    entradas = [r for r in caplog.records if r.name == NOME_LOGGER]
    assert len(entradas) == 1, [r.getMessage() for r in entradas]
    entrada = entradas[0]
    mensagem = entrada.getMessage()
    assert entrada.levelno == logging.INFO
    assert EMAIL in mensagem
    assert token in mensagem
    assert f"http://localhost:5173?tela=redefinir-senha&token={token}" in mensagem
    # O token aparece só nessa entrada, nunca na resposta.
    assert sum(token in r.getMessage() for r in caplog.records) == 1
    assert token not in _texto_da_resposta(resposta)


def test_em_development_email_desconhecido_nao_registra_nada(
    criar_app_isolada, tokens_gerados, caplog
):
    caplog.set_level(logging.INFO, logger=NOME_LOGGER)
    with criar_app_isolada(ambiente={"CHOOSEN_ENV": "development"}) as ctx:
        caplog.clear()
        resposta = ctx.cliente.post(URL_PEDIDO, json={"email": "ninguem@email.com"})

    assert resposta.status_code == 202
    assert tokens_gerados == []
    assert [r for r in caplog.records if r.name == NOME_LOGGER] == []


@pytest.mark.parametrize("ambiente", ["test", "production"])
def test_fora_de_development_o_token_nao_aparece_em_logs_nem_respostas(
    criar_app_isolada, tokens_gerados, caplog, ambiente
):
    caplog.set_level(logging.DEBUG)  # tudo o que chega ao root, de qualquer logger
    with criar_app_isolada(ambiente={"CHOOSEN_ENV": ambiente}) as ctx:
        usuario_id = _criar_ana(ctx)
        caplog.clear()

        pedido = ctx.cliente.post(URL_PEDIDO, json={"email": EMAIL})
        (token,) = tokens_gerados
        confirmacao_ruim = _confirmar(ctx, token, "curta")
        confirmacao = _confirmar(ctx, token)
        repetida = _confirmar(ctx, token)
        registros = _registros_token(ctx, usuario_id)

    assert pedido.status_code == 202 and pedido.json() == CORPO_202
    _assert_erro(confirmacao_ruim, 400, "senha_invalida")
    assert confirmacao.status_code == 204
    _assert_erro(repetida, 400, "token_invalido")
    # O token foi gravado (só o hash) e funcionou, mas não saiu em lugar nenhum.
    assert [r.token_hash for r in registros] == [seguranca.hash_token(token)]
    assert token not in caplog.text
    assert all(token not in r.getMessage() for r in caplog.records)
    for resposta in (pedido, confirmacao_ruim, confirmacao, repetida):
        assert token not in _texto_da_resposta(resposta)


def test_falha_ao_gravar_o_pedido_responde_202_e_registra_warning_sem_email_nem_token(
    criar_app_isolada, tokens_gerados, caplog, monkeypatch
):
    caplog.set_level(logging.INFO, logger=NOME_LOGGER)
    with criar_app_isolada(ambiente={"CHOOSEN_ENV": "development"}) as ctx:
        usuario_id = _criar_ana(ctx)
        caplog.clear()

        def _commit_falha(self):
            raise OperationalError("COMMIT", {}, Exception("banco indisponível"))

        with monkeypatch.context() as mp:
            mp.setattr(Session, "commit", _commit_falha)
            resposta = ctx.cliente.post(URL_PEDIDO, json={"email": EMAIL})

        registros = _registros_token(ctx, usuario_id)

    assert resposta.status_code == 202, resposta.text
    assert resposta.json() == CORPO_202
    assert registros == []  # rollback: nada gravado
    entradas = [r for r in caplog.records if r.name == NOME_LOGGER]
    assert [r.levelno for r in entradas] == [logging.WARNING]
    mensagem = entradas[0].getMessage()
    assert EMAIL not in mensagem
    assert all(token not in caplog.text for token in tokens_gerados)


# --- Confirmação da redefinição -----------------------------------------------


def test_confirmacao_204_troca_hash_marca_token_usado_e_revoga_todas_as_sessoes(
    app_isolada, tokens_gerados
):
    usuario_id = _criar_ana(app_isolada)
    sessao_1 = _logar(app_isolada, SENHA)
    sessao_2 = _logar(app_isolada, SENHA)
    assert sessao_1 and sessao_2
    token = _pedir(app_isolada, tokens_gerados)
    hash_antigo = _hash_senha(app_isolada, usuario_id)
    agora = app_isolada.relogio.avancar(minutes=10)

    resposta = _confirmar(app_isolada, token)

    assert resposta.status_code == 204, resposta.text
    assert resposta.content == b""
    hash_novo = _hash_senha(app_isolada, usuario_id)
    assert hash_novo != hash_antigo
    assert seguranca.verificar_senha(hash_novo, NOVA_SENHA)
    (registro,) = _registros_token(app_isolada, usuario_id)
    assert registro.usado_em == agora
    sessoes = _sessoes(app_isolada, usuario_id)
    assert len(sessoes) == 2
    assert all(s.revogada_em == agora for s in sessoes)
    for token_sessao in (sessao_1, sessao_2):
        me = app_isolada.cliente.get(
            "/api/v1/usuarios/me", headers={"Authorization": f"Bearer {token_sessao}"}
        )
        assert me.status_code == 401
    assert _logar(app_isolada, SENHA) is None
    assert _logar(app_isolada, NOVA_SENHA) is not None


def test_confirmacao_com_token_desconhecido_responde_400(app_isolada, tokens_gerados):
    usuario_id = _criar_ana(app_isolada)
    _pedir(app_isolada, tokens_gerados)
    hash_antigo = _hash_senha(app_isolada, usuario_id)

    for token in ("token-que-nao-existe", ""):
        _assert_erro(_confirmar(app_isolada, token), 400, "token_invalido")

    assert _hash_senha(app_isolada, usuario_id) == hash_antigo


def test_confirmacao_com_token_ja_usado_responde_400(app_isolada, tokens_gerados):
    usuario_id = _criar_ana(app_isolada)
    token = _pedir(app_isolada, tokens_gerados)
    assert _confirmar(app_isolada, token).status_code == 204
    hash_apos_uso = _hash_senha(app_isolada, usuario_id)
    sessao_nova = _logar(app_isolada, NOVA_SENHA)

    _assert_erro(_confirmar(app_isolada, token, "outra-senha-99"), 400, "token_invalido")

    assert _hash_senha(app_isolada, usuario_id) == hash_apos_uso
    # A Sessao criada depois do uso não foi revogada pela tentativa recusada.
    me = app_isolada.cliente.get(
        "/api/v1/usuarios/me", headers={"Authorization": f"Bearer {sessao_nova}"}
    )
    assert me.status_code == 200, me.text


def test_confirmacao_com_token_expirado_responde_400(app_isolada, tokens_gerados):
    usuario_id = _criar_ana(app_isolada)
    assert _logar(app_isolada, SENHA) is not None
    token = _pedir(app_isolada, tokens_gerados)
    hash_antigo = _hash_senha(app_isolada, usuario_id)

    # Exatamente 30 minutos depois do pedido o token já expirou.
    app_isolada.relogio.avancar(minutes=30)
    _assert_erro(_confirmar(app_isolada, token), 400, "token_invalido")

    assert _hash_senha(app_isolada, usuario_id) == hash_antigo
    (registro,) = _registros_token(app_isolada, usuario_id)
    assert registro.usado_em is None
    assert all(s.revogada_em is None for s in _sessoes(app_isolada, usuario_id))
    assert _logar(app_isolada, SENHA) is not None


def test_token_invalido_tem_precedencia_sobre_senha_invalida(app_isolada, tokens_gerados):
    _criar_ana(app_isolada)

    _assert_erro(_confirmar(app_isolada, "token-que-nao-existe", "curta"), 400, "token_invalido")


@pytest.mark.parametrize("senha_ruim", ["1234567", "x" * 129])
def test_senha_invalida_responde_400_e_mantem_o_token_utilizavel(
    app_isolada, tokens_gerados, senha_ruim
):
    usuario_id = _criar_ana(app_isolada)
    assert _logar(app_isolada, SENHA) is not None
    token = _pedir(app_isolada, tokens_gerados)
    hash_antigo = _hash_senha(app_isolada, usuario_id)

    resposta = _confirmar(app_isolada, token, senha_ruim)

    _assert_erro(resposta, 400, "senha_invalida")
    assert "8" in resposta.json()["error"]["message"]
    assert "128" in resposta.json()["error"]["message"]
    assert _hash_senha(app_isolada, usuario_id) == hash_antigo
    (registro,) = _registros_token(app_isolada, usuario_id)
    assert registro.usado_em is None and registro.invalidado_em is None
    assert all(s.revogada_em is None for s in _sessoes(app_isolada, usuario_id))

    # O mesmo token continua valendo para uma senha válida.
    assert _confirmar(app_isolada, token).status_code == 204
    assert _logar(app_isolada, NOVA_SENHA) is not None
