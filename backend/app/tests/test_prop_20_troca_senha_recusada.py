"""Property 20: Troca de senha recusada não tem efeito.

**Validates: Requirements 8.6, 8.8**

Para qualquer Usuario e qualquer sequência de tentativas recusadas de
``PUT /api/v1/usuarios/me/senha``:

- ``newPassword`` fora de 8 a 128 caracteres responde 422 ``validacao`` com
  ``newPassword`` em ``fields``, com a senha atual certa ou errada (a validação
  tem precedência sobre a senha atual incorreta, 8.8);
- ``newPassword`` válida e ``currentPassword`` que não confere responde 400
  ``senha_atual_incorreta`` (8.6).

Em todos os casos nada muda: o conteúdo bruto de todas as tabelas, lido por SQL
direto antes e depois de cada tentativa, é idêntico (Hash_Senha,
``atualizado_em``, todas as Sessoes incluindo ``revogada_em``, e os dados de
outro Usuario). O relógio avança antes de cada tentativa, então uma gravação de
``atualizado_em`` ou ``revogada_em`` apareceria no snapshot. Ao fim, todas as
Sessoes que estavam ativas continuam válidas, a revogada continua revogada e o
login com a senha original ainda funciona.

Cada exemplo roda sobre uma cópia própria do banco-modelo.
"""

from __future__ import annotations

from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import inspect, text

from app.autenticacao.servico import criar_usuario
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import (
    emails_normalizados,
    senhas,
    senhas_invalidas,
    senhas_validas,
)

URL_LOGIN = "/api/v1/auth/login"
URL_LOGOUT = "/api/v1/auth/logout"
URL_CADASTRO = "/api/v1/auth/cadastro"
URL_PERFIL = "/api/v1/usuarios/me"
URL_SENHA = "/api/v1/usuarios/me/senha"

EMAIL_OUTRO = "outro.usuario@exemplo.org"
SENHA_OUTRO = "senha-do-outro-123"


def _instantaneo(ctx) -> dict[str, list[tuple]]:
    """Conteúdo bruto de todas as tabelas do banco, lido por SQL direto."""
    with ctx.engine.connect() as con:
        tabelas = sorted(inspect(con).get_table_names())
        return {
            tabela: sorted(
                (tuple(linha) for linha in con.execute(text(f'SELECT * FROM "{tabela}"'))),
                key=repr,
            )
            for tabela in tabelas
        }


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _logar(ctx, email: str, senha: str):
    return ctx.cliente.post(URL_LOGIN, json={"email": email, "password": senha})


@st.composite
def _tentativa(draw, senha_correta: str):
    """Uma tentativa recusada: ``(currentPassword, newPassword, tipo, i_sessao)``.

    - ``"422"``: nova senha inválida; senha atual certa ou errada (precedência);
    - ``"400"``: nova senha válida e senha atual errada.
    """
    erradas = senhas().filter(lambda s: s != senha_correta)
    tipo = draw(st.sampled_from(["422", "400"]))
    if tipo == "422":
        atual = draw(st.one_of(st.just(senha_correta), erradas))
        nova = draw(senhas_invalidas())
    else:
        atual = draw(erradas)
        nova = draw(senhas_validas())
    return atual, nova, tipo, draw(st.integers(min_value=0, max_value=10))


@st.composite
def _cenario(draw):
    senha = draw(senhas_validas())
    tentativas = draw(st.lists(_tentativa(senha), min_size=1, max_size=4))
    return senha, tentativas


@settings(max_examples=100, deadline=None)
@given(
    email=emails_normalizados(),
    cenario=_cenario(),
    n_sessoes=st.integers(min_value=1, max_value=3),
    revogar_uma=st.booleans(),
    avancos=st.lists(
        st.integers(min_value=1, max_value=3600 * 10**6).map(lambda us: timedelta(microseconds=us)),
        min_size=4,
        max_size=4,
    ),
)
def test_troca_de_senha_recusada_nao_tem_efeito(
    criar_app_isolada, email, cenario, n_sessoes, revogar_uma, avancos
):
    senha, tentativas = cenario

    with criar_app_isolada() as ctx:
        with ctx.sessao() as db:
            criar_usuario(db, "Ana", email, senha, INSTANTE_INICIAL)
        # Sessão do banco fechada antes de chamar a API.

        # Outro Usuario, cujos dados também não podem mudar.
        resposta = ctx.cliente.post(
            URL_CADASTRO, json={"name": "Outro", "email": EMAIL_OUTRO, "password": SENHA_OUTRO}
        )
        assert resposta.status_code in (200, 201), resposta.text

        tokens = []
        for _ in range(n_sessoes):
            ctx.relogio.avancar(seconds=1)
            resposta = _logar(ctx, email, senha)
            assert resposta.status_code == 200, resposta.text
            tokens.append(resposta.json()["token"])

        # Opcionalmente, uma Sessao já revogada (revogada_em preenchido) para
        # conferir que a troca recusada também não mexe nela.
        revogada = None
        if revogar_uma:
            ctx.relogio.avancar(seconds=1)
            resposta = _logar(ctx, email, senha)
            assert resposta.status_code == 200, resposta.text
            revogada = resposta.json()["token"]
            assert ctx.cliente.post(URL_LOGOUT, headers=_auth(revogada)).status_code == 204

        for i, (atual, nova, tipo, i_sessao) in enumerate(tentativas):
            ctx.relogio.avancar(avancos[i])
            antes = _instantaneo(ctx)
            token = tokens[i_sessao % len(tokens)]

            resposta = ctx.cliente.put(
                URL_SENHA,
                json={"currentPassword": atual, "newPassword": nova},
                headers=_auth(token),
            )

            contexto = (tipo, len(atual), len(nova), resposta.text)
            corpo = resposta.json()
            assert set(corpo) == {"error"}, contexto
            erro = corpo["error"]
            if tipo == "422":
                assert resposta.status_code == 422, contexto
                assert erro["code"] == "validacao", contexto
                campos = [item["field"] for item in erro["fields"]]
                assert campos == ["newPassword"], contexto
            else:
                assert resposta.status_code == 400, contexto
                assert erro["code"] == "senha_atual_incorreta", contexto
                assert isinstance(erro["message"], str) and erro["message"], contexto

            assert _instantaneo(ctx) == antes, contexto

        # As Sessoes ativas continuam válidas; a revogada continua revogada.
        for token in tokens:
            resposta = ctx.cliente.get(URL_PERFIL, headers=_auth(token))
            assert resposta.status_code == 200, resposta.text
        if revogada is not None:
            assert ctx.cliente.get(URL_PERFIL, headers=_auth(revogada)).status_code == 401

        # A senha original continua valendo; nenhuma das senhas tentadas vale.
        assert _logar(ctx, email, senha).status_code == 200
        for _, nova, tipo, _ in tentativas:
            if nova != senha and tipo == "400":
                assert _logar(ctx, email, nova).status_code == 401
