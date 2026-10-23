"""Property 12: Sessões são independentes; logout revoga só a própria.

Para qualquer Usuario com N ≥ 1 Sessoes criadas por logins sucessivos, todas
são válidas ao mesmo tempo; e o logout com o token da Sessao ``i`` preenche
``revogada_em`` somente da Sessao ``i``, deixando as outras N−1 válidas.

O teste é baseado em modelo: de 1 a 3 Usuarios são cadastrados pela API (cada
cadastro já cria uma Sessao) e uma sequência aleatória de passos é aplicada:

- ``login``: ``POST /auth/login`` de um dos Usuarios cria uma Sessao nova;
- ``logout``: ``POST /auth/logout`` com um dos tokens já emitidos (ativo ou já
  revogado). Ativo → 204 e só essa Sessao ganha ``revogada_em`` igual ao
  instante do logout; já revogado → 401 ``sessao_invalida`` sem alterar nada;
- ``avancar``: o relógio da app avança alguns minutos (sempre bem antes do TTL).

Um oráculo guarda, para cada token, o dono e o ``revogada_em`` esperado. Depois
de cada passo, todas as Sessoes do banco (relidas numa ``Session`` nova) batem
com o oráculo: mesmo conjunto, mesmo dono, ``expira_em`` original e
``revogada_em`` vazio exatamente nas ativas. Ao final, ``GET /usuarios/me``
aceita cada token ativo (com o Perfil_Publico do dono) e recusa cada revogado.

Cada exemplo roda sobre uma cópia própria do banco-modelo.

**Validates: Requirements 2.2, 9.3**
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import select

from app.autenticacao.api import CODIGO_SESSAO_INVALIDA
from app.autenticacao.modelo import Sessao
from app.core.seguranca import hash_token

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_LOGIN = "/api/v1/auth/login"
URL_LOGOUT = "/api/v1/auth/logout"
URL_ME = "/api/v1/usuarios/me"

SENHA = "senha-segura-1"


@dataclass
class SessaoEsperada:
    """Estado esperado de uma Sessao no oráculo."""

    sessao_id: str
    usuario_id: str
    expira_em: datetime
    revogada_em: datetime | None = None


# Passos: o índice do Usuario/token é reduzido com ``%`` na hora de aplicar.
_passo_login = st.tuples(st.just("login"), st.integers(min_value=0, max_value=2))
_passo_logout = st.tuples(st.just("logout"), st.integers(min_value=0, max_value=63))
_passo_avancar = st.tuples(st.just("avancar"), st.integers(min_value=0, max_value=90))
passos = st.lists(
    st.one_of(_passo_login, _passo_login, _passo_logout, _passo_logout, _passo_avancar),
    min_size=1,
    max_size=20,
)


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _instante(texto: str) -> datetime:
    assert texto.endswith("Z"), texto
    return datetime.fromisoformat(texto)


def _registrar(ctx, oraculo: dict[str, SessaoEsperada], corpo: dict) -> str:
    """Acrescenta ao oráculo a Sessao recém-criada (achada pelo hash do token)."""
    token = corpo["token"]
    assert token not in oraculo, "token repetido entre Sessoes"
    with ctx.sessao() as db:
        sessao = db.scalars(
            select(Sessao).where(Sessao.token_hash == hash_token(token))
        ).one()
        oraculo[token] = SessaoEsperada(
            sessao_id=sessao.id,
            usuario_id=sessao.usuario_id,
            expira_em=sessao.expira_em,
        )
    assert oraculo[token].usuario_id == corpo["user"]["id"]
    assert oraculo[token].expira_em == _instante(corpo["expiresAt"])
    return token


def _conferir_banco(ctx, oraculo: dict[str, SessaoEsperada], contexto) -> None:
    """Todas as Sessoes persistidas batem com o oráculo."""
    esperadas = {e.sessao_id: e for e in oraculo.values()}
    with ctx.sessao() as db:
        persistidas = {s.id: s for s in db.scalars(select(Sessao)).all()}
    assert set(persistidas) == set(esperadas), contexto
    for sessao_id, esperada in esperadas.items():
        real = persistidas[sessao_id]
        assert real.usuario_id == esperada.usuario_id, contexto
        assert real.expira_em == esperada.expira_em, contexto
        assert real.revogada_em == esperada.revogada_em, (
            contexto,
            sessao_id,
            real.revogada_em,
            esperada.revogada_em,
        )


@settings(max_examples=100, deadline=None)
@given(n_usuarios=st.integers(min_value=1, max_value=3), sequencia=passos)
def test_sessoes_sao_independentes_e_logout_revoga_so_a_propria(
    criar_app_isolada, n_usuarios, sequencia
):
    with criar_app_isolada() as ctx:
        cliente = ctx.cliente
        oraculo: dict[str, SessaoEsperada] = {}
        emissao: list[str] = []  # tokens na ordem em que foram emitidos
        emails: list[str] = []

        for i in range(n_usuarios):
            email = f"pessoa{i}@exemplo.com"
            resposta = cliente.post(
                URL_CADASTRO,
                json={"name": f"Pessoa {i}", "email": email, "password": SENHA},
            )
            assert resposta.status_code == 201, resposta.text
            emissao.append(_registrar(ctx, oraculo, resposta.json()))
            emails.append(email)
        _conferir_banco(ctx, oraculo, "após cadastros")

        for passo_n, (acao, valor) in enumerate(sequencia):
            contexto = (passo_n, acao, valor)
            if acao == "login":
                resposta = cliente.post(
                    URL_LOGIN,
                    json={"email": emails[valor % n_usuarios], "password": SENHA},
                )
                assert resposta.status_code == 200, (contexto, resposta.text)
                emissao.append(_registrar(ctx, oraculo, resposta.json()))
            elif acao == "logout":
                token = emissao[valor % len(emissao)]
                esperada = oraculo[token]
                resposta = cliente.post(URL_LOGOUT, headers=_bearer(token))
                if esperada.revogada_em is None:
                    assert resposta.status_code == 204, (contexto, resposta.text)
                    assert resposta.content == b"", contexto
                    esperada.revogada_em = ctx.relogio.agora()
                else:
                    assert resposta.status_code == 401, (contexto, resposta.text)
                    assert resposta.headers.get("WWW-Authenticate") == "Bearer", contexto
                    assert resposta.json()["error"]["code"] == CODIGO_SESSAO_INVALIDA
            else:
                ctx.relogio.avancar(minutes=valor)

            _conferir_banco(ctx, oraculo, contexto)

        # Todas as ativas valem ao mesmo tempo; as revogadas, nenhuma.
        agora = ctx.relogio.agora()
        for token, esperada in oraculo.items():
            assert esperada.expira_em > agora  # o teste nunca chega ao TTL
            resposta = cliente.get(URL_ME, headers=_bearer(token))
            if esperada.revogada_em is None:
                assert resposta.status_code == 200, resposta.text
                assert resposta.json()["id"] == esperada.usuario_id
            else:
                assert resposta.status_code == 401, resposta.text
                assert resposta.headers.get("WWW-Authenticate") == "Bearer"

        # GET /usuarios/me não altera nenhuma Sessao.
        _conferir_banco(ctx, oraculo, "após GET /usuarios/me")
