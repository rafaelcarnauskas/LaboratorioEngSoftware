"""Property 7: Edição de perfil só altera os quatro campos e mantém criado_em.

Para qualquer Usuario (inclusive com ``is_community_admin``/``is_system_admin``
arbitrários), quaisquer dados de perfil válidos e quaisquer campos extras no
corpo (``email``, ``password``, ``isCommunityAdmin``, ``isSystemAdmin``, ``id``,
``createdAt`` e outros), depois de ``PATCH /usuarios/me`` a linha inteira do
Usuario no banco é igual à anterior, exceto:

- ``nome == name.strip()``;
- ``username == username`` e ``username_normalizado == username.lower()``;
- ``descricao``/``foto`` iguais aos enviados (``null`` vira ``""``);
- ``atualizado_em`` igual ao instante do relógio na edição.

Em particular ``id``, ``email``, ``hash_senha``, as flags de administração e
``criado_em`` não mudam. A comparação é feita sobre todas as colunas da tabela
``usuario`` (lidas direto da ``Table``, sem passar pelo ORM do serviço), e o
valor esperado é calculado aqui a partir das definições do Requisito 7.

**Validates: Requirements 7.3, 1.1, 1.12**
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import select, update

from app.autenticacao.modelo import Usuario
from app.tests.estrategias import (
    descricoes_validas,
    emails_normalizados,
    fotos_validas,
    nomes_validos,
    senhas_validas,
    usernames_validos,
)

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_PERFIL = "/api/v1/usuarios/me"
CAMPOS_EDITAVEIS = frozenset({"name", "username", "description", "photo"})
COLUNAS_USUARIO = frozenset({
    "id", "email", "username", "username_normalizado", "hash_senha", "nome",
    "descricao", "foto", "is_community_admin", "is_system_admin",
    "criado_em", "atualizado_em",
})

TABELA_USUARIO = Usuario.__table__


def _linha_usuario(db) -> dict:
    """Todas as colunas da única linha de ``usuario``, como dicionário."""
    linhas = db.execute(select(TABELA_USUARIO)).mappings().all()
    assert len(linhas) == 1
    return dict(linhas[0])


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

_instantes_texto = st.datetimes(
    min_value=datetime(1990, 1, 1), max_value=datetime(2060, 1, 1), timezones=st.just(UTC)
).map(_iso_utc)

# Tentativas de alterar campos que a edição não pode tocar, em camelCase e
# nos nomes das colunas.
_EXTRAS_CONHECIDOS = {
    "email": emails_normalizados(),
    "password": senhas_validas(),
    "currentPassword": senhas_validas(),
    "newPassword": senhas_validas(),
    "isCommunityAdmin": st.booleans(),
    "isSystemAdmin": st.booleans(),
    "id": st.uuids().map(str),
    "createdAt": _instantes_texto,
    "updatedAt": _instantes_texto,
    "is_community_admin": st.booleans(),
    "is_system_admin": st.booleans(),
    "hash_senha": st.text(max_size=40),
    "hashSenha": st.text(max_size=40),
    "criado_em": _instantes_texto,
    "atualizado_em": _instantes_texto,
    "nome": st.text(max_size=20),
    "descricao": st.text(max_size=20),
    "foto": st.just("data:image/png;base64,QUJD"),
    "username_normalizado": st.text(max_size=20),
    "usernameNormalizado": st.text(max_size=20),
}

extras_corpo = st.tuples(
    st.fixed_dictionaries(
        {
            "email": emails_normalizados(),
            "password": senhas_validas(),
            "isCommunityAdmin": st.booleans(),
            "isSystemAdmin": st.booleans(),
            "id": st.uuids().map(str),
            "createdAt": _instantes_texto,
        },
        optional={k: v for k, v in _EXTRAS_CONHECIDOS.items()
                  if k not in {"email", "password", "isCommunityAdmin",
                               "isSystemAdmin", "id", "createdAt"}},
    ),
    st.dictionaries(
        st.text(min_size=1, max_size=12).filter(lambda k: k not in CAMPOS_EDITAVEIS),
        _valores_json,
        max_size=3,
    ),
).map(lambda partes: {**partes[1], **partes[0]})

instantes = st.datetimes(
    min_value=datetime(2020, 1, 1),
    max_value=datetime(2035, 12, 31),
    timezones=st.just(UTC),
)

# Fração (em milionésimos) do TTL da Sessao entre o cadastro e a edição: a
# Sessao do cadastro continua válida. Inclui zero (mesmo instante).
_MILIONESIMOS = 1_000_000
fracoes_ttl = st.one_of(st.just(0), st.integers(min_value=0, max_value=_MILIONESIMOS - 1))


@settings(max_examples=100, deadline=None)
@given(
    nome_cadastro=nomes_validos(),
    email_cadastro=emails_normalizados(),
    senha=senhas_validas(),
    flags_admin=st.tuples(st.booleans(), st.booleans()),
    inicio=instantes,
    fracao_ttl=fracoes_ttl,
    nome=nomes_validos(),
    username=usernames_validos(),
    descricao=st.one_of(st.none(), descricoes_validas()),
    foto=st.one_of(st.none(), fotos_validas()),
    extras=extras_corpo,
)
def test_edicao_de_perfil_so_altera_os_quatro_campos(
    criar_app_isolada, nome_cadastro, email_cadastro, senha, flags_admin, inicio,
    fracao_ttl, nome, username, descricao, foto, extras,
):
    is_community_admin, is_system_admin = flags_admin

    with criar_app_isolada(inicio=inicio) as ctx:
        cadastro = ctx.cliente.post(
            URL_CADASTRO,
            json={"email": email_cadastro, "name": nome_cadastro, "password": senha},
        )
        assert cadastro.status_code == 201, cadastro.text
        token = cadastro.json()["token"]
        cabecalho = {"Authorization": f"Bearer {token}"}

        # Flags arbitrárias para provar que a edição não as redefine.
        with ctx.sessao() as db:
            db.execute(
                update(TABELA_USUARIO).values(
                    is_community_admin=is_community_admin,
                    is_system_admin=is_system_admin,
                )
            )
            db.commit()
            antes = _linha_usuario(db)

        assert set(antes) == COLUNAS_USUARIO

        ttl = timedelta(minutes=ctx.config.session_ttl_minutes)
        agora_edicao = ctx.relogio.avancar(ttl * fracao_ttl // _MILIONESIMOS)
        assert agora_edicao < inicio + ttl
        corpo = {
            **extras,
            "name": nome,
            "username": username,
            "description": descricao,
            "photo": foto,
        }
        resposta = ctx.cliente.patch(URL_PERFIL, json=corpo, headers=cabecalho)
        assert resposta.status_code == 200, resposta.text

        esperado = {
            **antes,
            "nome": nome.strip(),
            "username": username,
            "username_normalizado": username.lower(),
            "descricao": "" if descricao is None else descricao,
            "foto": "" if foto is None else foto,
            "atualizado_em": agora_edicao,
        }

        with ctx.sessao() as db:
            depois = _linha_usuario(db)

        assert depois == esperado
        # Explícito para o relatório de falha: o que nunca pode mudar.
        for coluna in ("id", "email", "hash_senha", "is_community_admin",
                       "is_system_admin", "criado_em"):
            assert depois[coluna] == antes[coluna], coluna
        assert depois["criado_em"] == inicio

        perfil = resposta.json()
        assert perfil["id"] == antes["id"]
        assert perfil["email"] == antes["email"]
        assert perfil["isCommunityAdmin"] is is_community_admin
        assert perfil["isSystemAdmin"] is is_system_admin
        assert perfil["createdAt"] == _iso_utc(inicio)
        assert perfil["updatedAt"] == _iso_utc(agora_edicao)
