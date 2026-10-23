"""Property 8: Login aceita qualquer variação do e-mail cadastrado e devolve só o
Perfil_Publico.

Para qualquer Usuario cadastrado e qualquer variação do seu e-mail com espaços
nas pontas e maiúsculas trocadas, ``POST /api/v1/auth/login`` com a senha
correta responde 200 com ``token``, ``expiresAt`` posterior ao instante da
criação da Sessao e ``user`` contendo exatamente as chaves do Perfil_Publico
(sem ``password``, ``hashSenha`` nem campos de sessão).

**Validates: Requirements 3.2, 3.3, 1.13**
"""

from __future__ import annotations

from datetime import datetime, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from app.autenticacao.modelo import Sessao
from app.autenticacao.servico import criar_usuario, validar_sessao
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import (
    emails_normalizados,
    nomes_validos,
    senhas_validas,
    variacoes_de_email,
)

URL_LOGIN = "/api/v1/auth/login"

CHAVES_RESPOSTA = {"token", "expiresAt", "user"}
CHAVES_PERFIL_PUBLICO = {
    "id",
    "name",
    "username",
    "email",
    "description",
    "photo",
    "isCommunityAdmin",
    "isSystemAdmin",
    "createdAt",
    "updatedAt",
}

# Intervalo entre o cadastro e o login (o relógio da app avança por ele).
atrasos_login = st.timedeltas(min_value=timedelta(0), max_value=timedelta(days=30))


def _instante(texto: str) -> datetime:
    """Lê o ISO-8601 com ``Z`` devolvido pela API (sempre com fuso)."""
    assert texto.endswith("Z"), texto
    instante = datetime.fromisoformat(texto)
    assert instante.utcoffset() == timedelta(0)
    return instante


@settings(max_examples=100, deadline=None)
@given(
    email=emails_normalizados(),
    nome=nomes_validos(),
    senha=senhas_validas(),
    atraso=atrasos_login,
    dados=st.data(),
)
def test_login_aceita_variacoes_do_email_e_devolve_so_o_perfil_publico(
    criar_app_isolada, email, nome, senha, atraso, dados
):
    variacoes = dados.draw(
        st.lists(variacoes_de_email(email), min_size=1, max_size=3), label="variacoes"
    )

    with criar_app_isolada() as ctx:
        ttl = ctx.config.session_ttl_minutes
        with ctx.sessao() as db:
            usuario = criar_usuario(db, nome, email, senha, INSTANTE_INICIAL)
            usuario_id = usuario.id
            hash_senha = usuario.hash_senha
        # Sessão do banco fechada antes de chamar a API.

        agora = ctx.relogio.avancar(atraso)
        tokens: set[str] = set()

        for variacao in variacoes:
            resposta = ctx.cliente.post(URL_LOGIN, json={"email": variacao, "password": senha})
            assert resposta.status_code == 200, (variacao, resposta.text)
            corpo = resposta.json()

            # Só token, expiresAt e user; nada de sessão ou hash no nível de cima.
            assert set(corpo) == CHAVES_RESPOSTA

            token = corpo["token"]
            assert isinstance(token, str) and token
            assert token not in tokens  # cada login cria uma Sessao nova
            tokens.add(token)

            # expiresAt posterior ao instante da criação da Sessao (o "agora" do login).
            expira_em = _instante(corpo["expiresAt"])
            assert expira_em > agora
            assert expira_em == agora + timedelta(minutes=ttl)

            # user tem exatamente as chaves do Perfil_Publico, do Usuario cadastrado.
            perfil = corpo["user"]
            assert set(perfil) == CHAVES_PERFIL_PUBLICO
            assert perfil["id"] == usuario_id
            assert perfil["email"] == email
            assert perfil["name"] == nome.strip()
            assert perfil["isCommunityAdmin"] is False
            assert perfil["isSystemAdmin"] is False

            # As chaves exatas acima já excluem password/hashSenha; o valor do
            # Hash_Senha também não aparece em parte alguma da resposta.
            assert hash_senha not in resposta.text

            # O token devolvido é de uma Sessao_Valida do mesmo Usuario.
            with ctx.sessao() as db:
                sessao = validar_sessao(db, token, agora)
                assert sessao is not None
                assert sessao.usuario_id == usuario_id
                assert sessao.revogada_em is None

        with ctx.sessao() as db:
            total = db.query(Sessao).filter(Sessao.usuario_id == usuario_id).count()
        assert total == len(variacoes)
