"""Property 6: Perfil editado volta igual na consulta (ida e volta).

Para qualquer Usuario e quaisquer dados de perfil válidos (nome com espaços
Unicode nas pontas, username de 1 a 30 caracteres, descrição de 0 a 160 ou
``null``, foto vazia, ``null`` ou data URL de imagem até 2 097 152 bytes),
``PATCH /usuarios/me`` seguido de ``GET /usuarios/me`` devolve
``name == dados.name.strip()`` e ``username``, ``description`` e ``photo`` iguais
aos enviados (``null`` volta como ``""``), e as duas respostas são iguais entre
si e contêm exatamente as chaves do Perfil_Publico (nunca Hash_Senha).

Cada exemplo faz de 1 a 3 edições seguidas no mesmo Usuario, para que a ida e
volta valha também depois de edições anteriores. Oráculos independentes: o
valor esperado é calculado aqui (``str.strip()`` e ``None -> ""``), as chaves do
Perfil_Publico são uma constante do teste, ``updatedAt`` é o instante do
relógio controlado formatado aqui, e a linha gravada em ``usuario`` é conferida
direto no banco.

**Validates: Requirements 7.2, 7.8, 1.13, 6.2**
"""

# Feature: autenticacao-conta, Property 6: Perfil editado volta igual na consulta (ida e volta)

from __future__ import annotations

from datetime import UTC, datetime

from hypothesis import given, settings
from hypothesis import strategies as st

from app.autenticacao.modelo import Usuario
from app.tests.estrategias import (
    descricoes_validas,
    emails_normalizados,
    fotos_validas,
    nomes_validos,
    usernames_validos,
)

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_PERFIL = "/api/v1/usuarios/me"
SENHA = "senha-segura-1"

CHAVES_PERFIL_PUBLICO = frozenset({
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
})


def _iso_utc(instante: datetime) -> str:
    return instante.astimezone(UTC).isoformat().replace("+00:00", "Z")


dados_perfil = st.fixed_dictionaries({
    "name": nomes_validos(),
    "username": usernames_validos(),
    "description": st.one_of(st.none(), descricoes_validas()),
    "photo": st.one_of(st.none(), fotos_validas()),
})

# Avanço do relógio antes de cada edição: até 1 dia (com microssegundos), para
# que 3 edições somadas fiquem bem dentro do TTL padrão da Sessao (7 dias).
avancos = st.tuples(
    st.integers(min_value=1, max_value=60 * 24),
    st.integers(min_value=0, max_value=999_999),
)


@settings(max_examples=100, deadline=None)
@given(
    email=emails_normalizados(),
    nome_inicial=nomes_validos(),
    edicoes=st.lists(st.tuples(dados_perfil, avancos), min_size=1, max_size=3),
)
def test_perfil_editado_volta_igual_na_consulta(criar_app_isolada, email, nome_inicial, edicoes):
    with criar_app_isolada() as ctx:
        resposta = ctx.cliente.post(
            URL_CADASTRO, json={"name": nome_inicial, "email": email, "password": SENHA}
        )
        assert resposta.status_code == 201, resposta.text
        corpo = resposta.json()
        token = corpo["token"]
        criado = corpo["user"]
        assert set(criado) == CHAVES_PERFIL_PUBLICO
        cabecalho = {"Authorization": f"Bearer {token}"}

        for dados, (minutos, micros) in edicoes:
            agora = ctx.relogio.avancar(minutes=minutos, microseconds=micros)
            esperado = {
                "name": dados["name"].strip(),
                "username": dados["username"],
                "description": dados["description"] if dados["description"] is not None else "",
                "photo": dados["photo"] if dados["photo"] is not None else "",
            }

            # --- Ida: PATCH --------------------------------------------------
            editado = ctx.cliente.patch(URL_PERFIL, json=dados, headers=cabecalho)
            assert editado.status_code == 200, editado.text[:500]
            perfil_patch = editado.json()
            assert set(perfil_patch) == CHAVES_PERFIL_PUBLICO
            for campo, valor in esperado.items():
                assert perfil_patch[campo] == valor, (
                    f"PATCH devolveu {campo}={perfil_patch[campo]!r:.200}, esperado {valor!r:.200}"
                )
            assert perfil_patch["updatedAt"] == _iso_utc(agora)
            for campo in ("id", "email", "createdAt", "isCommunityAdmin", "isSystemAdmin"):
                assert perfil_patch[campo] == criado[campo], campo

            # --- Volta: GET --------------------------------------------------
            consultado = ctx.cliente.get(URL_PERFIL, headers=cabecalho)
            assert consultado.status_code == 200, consultado.text[:500]
            perfil_get = consultado.json()
            assert set(perfil_get) == CHAVES_PERFIL_PUBLICO
            assert perfil_get == perfil_patch

            # --- O que ficou gravado (Session fechada antes da próxima chamada)
            with ctx.sessao() as db:
                usuario = db.get(Usuario, criado["id"])
                assert usuario is not None
                gravado = {
                    "name": usuario.nome,
                    "username": usuario.username,
                    "description": usuario.descricao,
                    "photo": usuario.foto,
                }
                assert gravado == esperado
