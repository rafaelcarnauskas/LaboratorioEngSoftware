"""Property 2: Cadastro válido grava os valores normalizados e nunca concede administração.

Para qualquer nome válido, e-mail válido não cadastrado (com espaços nas pontas
e maiúsculas arbitrárias), senha de 8 a 128 caracteres e quaisquer campos extras
no corpo (incluindo ``isCommunityAdmin`` e ``isSystemAdmin`` verdadeiros), o
cadastro responde 201 e o Usuario gravado tem ``nome == nome.strip()``,
``email == normalizar_email(email)``, a senha confere com ``hash_senha``,
``is_community_admin == is_system_admin == False`` e ``criado_em == atualizado_em``.

Oráculos independentes do código de produção: o Email_Normalizado é calculado
aqui como ``email.strip().lower()`` (definição do glossário), a senha é
conferida direto com ``argon2`` e o hash do Token_Sessao com ``hashlib``.

**Validates: Requirements 1.2, 1.6, 1.10, 1.11, 4.2, 4.5**
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import select

from app.autenticacao.modelo import Sessao, Usuario
from app.tests.estrategias import emails_validos, nomes_validos, senhas_validas

URL_CADASTRO = "/api/v1/auth/cadastro"
CAMPOS_DO_CADASTRO = frozenset({"email", "name", "password"})

# Verificador Argon2 próprio do teste: confere qualquer hash Argon2 (os
# parâmetros vêm codificados no próprio hash).
_VERIFICADOR = PasswordHasher()


def _senha_confere(hash_senha: str, senha: str) -> bool:
    try:
        return _VERIFICADOR.verify(hash_senha, senha)
    except VerificationError:
        return False


def _iso_utc(instante: datetime) -> str:
    return instante.astimezone(UTC).isoformat().replace("+00:00", "Z")


# --- Campos extras no corpo ---------------------------------------------------

_valores_json = st.recursive(
    st.one_of(
        st.none(),
        st.booleans(),
        st.integers(min_value=-(2**31), max_value=2**31),
        st.text(max_size=20),
    ),
    lambda filhos: st.one_of(
        st.lists(filhos, max_size=3),
        st.dictionaries(st.text(max_size=8), filhos, max_size=3),
    ),
    max_leaves=6,
)

# Tentativas óbvias de escalar privilégio ou forjar campos do Usuario.
_EXTRAS_CONHECIDOS = {
    "is_community_admin": st.just(True),
    "is_system_admin": st.just(True),
    "isAdmin": st.just(True),
    "id": st.text(max_size=36),
    "username": st.text(max_size=30),
    "createdAt": st.just("2000-01-01T00:00:00Z"),
    "updatedAt": st.just("2000-01-01T00:00:00Z"),
    "hashSenha": st.text(max_size=20),
    "description": st.text(max_size=20),
    "photo": st.just("data:image/png;base64,QUJD"),
    "Email": st.just("outro@exemplo.com"),
}

extras_corpo = st.tuples(
    st.fixed_dictionaries(
        {"isCommunityAdmin": st.just(True), "isSystemAdmin": st.just(True)},
        optional=_EXTRAS_CONHECIDOS,
    ),
    st.dictionaries(
        st.text(min_size=1, max_size=12).filter(lambda k: k not in CAMPOS_DO_CADASTRO),
        _valores_json,
        max_size=3,
    ),
).map(lambda partes: {**partes[1], **partes[0]})

# Instante do cadastro (relógio controlado), com microssegundos.
instantes_cadastro = st.datetimes(
    min_value=datetime(2020, 1, 1),
    max_value=datetime(2035, 12, 31),
    timezones=st.just(UTC),
)


@settings(max_examples=100, deadline=None)
@given(
    nome=nomes_validos(),
    email=emails_validos(),
    senha=senhas_validas(),
    extras=extras_corpo,
    agora=instantes_cadastro,
)
def test_cadastro_valido_grava_valores_normalizados_sem_admin(
    criar_app_isolada, nome, email, senha, extras, agora
):
    nome_esperado = nome.strip()
    email_esperado = email.strip().lower()
    corpo = {**extras, "email": email, "name": nome, "password": senha}

    with criar_app_isolada(inicio=agora) as ctx:
        ttl = ctx.config.session_ttl_minutes
        resposta = ctx.cliente.post(URL_CADASTRO, json=corpo)

        assert resposta.status_code == 201, resposta.text
        dados = resposta.json()
        assert set(dados) == {"token", "expiresAt", "user"}
        token = dados["token"]
        assert isinstance(token, str) and token
        assert dados["expiresAt"] == _iso_utc(agora + timedelta(minutes=ttl))

        perfil = dados["user"]
        assert perfil["name"] == nome_esperado
        assert perfil["email"] == email_esperado
        assert perfil["isCommunityAdmin"] is False
        assert perfil["isSystemAdmin"] is False
        assert perfil["createdAt"] == perfil["updatedAt"] == _iso_utc(agora)

        with ctx.sessao() as db:
            usuarios = db.scalars(select(Usuario)).all()
            assert len(usuarios) == 1
            usuario = usuarios[0]

            assert usuario.id == perfil["id"]
            assert usuario.nome == nome_esperado
            assert usuario.email == email_esperado
            assert _senha_confere(usuario.hash_senha, senha)
            assert usuario.is_community_admin is False
            assert usuario.is_system_admin is False
            assert usuario.criado_em == usuario.atualizado_em == agora

            # 4.5: exatamente uma Sessao, do novo Usuario, para o token devolvido.
            sessoes = db.scalars(select(Sessao)).all()
            assert len(sessoes) == 1
            sessao = sessoes[0]
            assert sessao.usuario_id == usuario.id
            assert sessao.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()
            assert sessao.criada_em == agora
            assert sessao.expira_em == agora + timedelta(minutes=ttl)
            assert sessao.revogada_em is None
