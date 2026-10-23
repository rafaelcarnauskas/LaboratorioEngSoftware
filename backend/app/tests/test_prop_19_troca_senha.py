"""Property 19: Troca de senha (ida e volta) e revogação das outras sessões.

Para qualquer Usuario com N ≥ 1 Sessoes e qualquer par de senha anterior e
nova senha distintas (a nova com 8 a 128 caracteres), a troca feita com a
Sessao ``i`` (``PUT /api/v1/usuarios/me/senha``) responde 204 sem corpo; depois:

- o Hash_Senha confere com a nova senha e não com a anterior (verificado com
  ``argon2`` direto, sem passar pelo serviço) e ``atualizado_em`` é o instante
  da troca;
- a Sessao ``i`` continua válida (``GET /usuarios/me`` 200, ``revogada_em``
  vazio) e as outras N−1 ficam revogadas com ``revogada_em`` igual ao instante
  da troca (``GET /usuarios/me`` 401);
- as Sessoes de outro Usuario não mudam;
- o login com a nova senha funciona e o login com a senha anterior responde
  401 ``credenciais_invalidas``.

**Validates: Requirements 8.4, 8.5, 8.7**
"""

from __future__ import annotations

from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from hypothesis import assume, given, settings
from hypothesis import strategies as st
from sqlalchemy import select

from app.autenticacao.modelo import Sessao, Usuario
from app.autenticacao.servico import criar_sessao, criar_usuario
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import senhas_validas

URL_SENHA = "/api/v1/usuarios/me/senha"
URL_PERFIL = "/api/v1/usuarios/me"
URL_LOGIN = "/api/v1/auth/login"

EMAIL = "ana@exemplo.com"
EMAIL_OUTRO = "bia@exemplo.com"
SENHA_OUTRO = "senha-da-bia-1"
TTL_MINUTOS = 7 * 24 * 60

# Oráculo independente: argon2 verifica qualquer hash pelos parâmetros embutidos.
_VERIFICADOR = PasswordHasher()

atrasos = st.timedeltas(min_value=timedelta(microseconds=1), max_value=timedelta(days=3))


def _confere(hash_senha: str, senha: str) -> bool:
    try:
        return _VERIFICADOR.verify(hash_senha, senha)
    except VerificationError:
        return False


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@settings(max_examples=100, deadline=None)
@given(
    senha_anterior=senhas_validas(),
    nova_senha=senhas_validas(),
    n_sessoes=st.integers(min_value=1, max_value=5),
    n_sessoes_outro=st.integers(min_value=0, max_value=2),
    atraso=atrasos,
    dados=st.data(),
)
def test_troca_de_senha_ida_e_volta_e_revoga_as_outras_sessoes(
    criar_app_isolada, senha_anterior, nova_senha, n_sessoes, n_sessoes_outro, atraso, dados
):
    assume(senha_anterior != nova_senha)
    indice_atual = dados.draw(st.integers(min_value=0, max_value=n_sessoes - 1), label="i")

    with criar_app_isolada() as ctx:
        with ctx.sessao() as db:
            usuario = criar_usuario(db, "Ana", EMAIL, senha_anterior, INSTANTE_INICIAL)
            usuario_id = usuario.id
            sessoes = [criar_sessao(db, usuario, INSTANTE_INICIAL, TTL_MINUTOS)
                       for _ in range(n_sessoes)]
            ids = [s.id for s, _ in sessoes]
            tokens = [t for _, t in sessoes]

            outro = criar_usuario(db, "Bia", EMAIL_OUTRO, SENHA_OUTRO, INSTANTE_INICIAL)
            outro_id = outro.id
            tokens_outro = [criar_sessao(db, outro, INSTANTE_INICIAL, TTL_MINUTOS)[1]
                            for _ in range(n_sessoes_outro)]
            hash_outro = outro.hash_senha
        # Sessão do banco fechada antes de chamar a API.

        agora = ctx.relogio.avancar(atraso)
        token_atual = tokens[indice_atual]

        resposta = ctx.cliente.put(
            URL_SENHA,
            json={"currentPassword": senha_anterior, "newPassword": nova_senha},
            headers=_bearer(token_atual),
        )
        assert resposta.status_code == 204, resposta.text
        assert resposta.content == b""

        # Estado gravado, relido numa Session nova.
        with ctx.sessao() as db:
            relido = db.get(Usuario, usuario_id)
            assert _confere(relido.hash_senha, nova_senha)
            assert not _confere(relido.hash_senha, senha_anterior)
            assert relido.atualizado_em == agora
            assert relido.criado_em == INSTANTE_INICIAL

            por_id = {
                s.id: s
                for s in db.scalars(select(Sessao).where(Sessao.usuario_id == usuario_id))
            }
            assert set(por_id) == set(ids)
            for j, sessao_id in enumerate(ids):
                if j == indice_atual:
                    assert por_id[sessao_id].revogada_em is None
                else:
                    assert por_id[sessao_id].revogada_em == agora, (j, por_id[sessao_id].revogada_em)

            outro_relido = db.get(Usuario, outro_id)
            assert outro_relido.hash_senha == hash_outro
            assert outro_relido.atualizado_em == INSTANTE_INICIAL
            sessoes_outro = db.scalars(select(Sessao).where(Sessao.usuario_id == outro_id)).all()
            assert len(sessoes_outro) == n_sessoes_outro
            assert all(s.revogada_em is None for s in sessoes_outro)

        # Pela API: só a Sessao i continua válida; as do outro Usuario também.
        for j, token in enumerate(tokens):
            perfil = ctx.cliente.get(URL_PERFIL, headers=_bearer(token))
            if j == indice_atual:
                assert perfil.status_code == 200, perfil.text
                assert perfil.json()["id"] == usuario_id
            else:
                assert perfil.status_code == 401, (j, perfil.text)
                assert perfil.json()["error"]["code"] == "sessao_invalida"
        for token in tokens_outro:
            perfil = ctx.cliente.get(URL_PERFIL, headers=_bearer(token))
            assert perfil.status_code == 200, perfil.text
            assert perfil.json()["id"] == outro_id

        # Login: a senha anterior não entra mais; a nova entra.
        antigo = ctx.cliente.post(URL_LOGIN, json={"email": EMAIL, "password": senha_anterior})
        assert antigo.status_code == 401, antigo.text
        assert antigo.json()["error"]["code"] == "credenciais_invalidas"

        novo = ctx.cliente.post(URL_LOGIN, json={"email": EMAIL, "password": nova_senha})
        assert novo.status_code == 200, novo.text
        assert novo.json()["user"]["id"] == usuario_id
        perfil = ctx.cliente.get(URL_PERFIL, headers=_bearer(novo.json()["token"]))
        assert perfil.status_code == 200, perfil.text
