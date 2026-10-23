"""Property 4: Entrada inválida é rejeitada por inteiro, com todos os campos identificados.

**Validates: Requirements 1.14, 4.8, 7.5**

- Edição de perfil: para qualquer Usuario e qualquer subconjunto não vazio de
  ``name``, ``username``, ``description`` e ``photo`` tornados inválidos (com os
  demais válidos), ``PATCH /api/v1/usuarios/me`` responde 422 ``validacao`` com
  ``fields`` listando exatamente esse subconjunto (uma vez cada) e nenhuma linha
  de nenhuma tabela muda, incluindo ``atualizado_em`` (o relógio avança antes da
  requisição, então uma gravação parcial apareceria no snapshot).
- Cadastro: para qualquer subconjunto não vazio de ``name``, ``email`` e
  ``password`` inválidos (com os demais válidos), ``POST /api/v1/auth/cadastro``
  responde 422 ``validacao`` com exatamente esses campos, sem token, e nenhuma
  linha de nenhuma tabela muda (em particular, nem Usuario nem Sessao novos).

Precedência: o campo válido pode coincidir com dado de outro Usuario (o e-mail
já cadastrado, em qualquer caixa, ou o username de outro Usuario); a resposta
continua 422, nunca 409.

Oráculos: o subconjunto inválido vem do próprio gerador (``estrategias.py``
gera valores válidos/inválidos por construção) e o "nada mudou" é conferido
comparando o conteúdo bruto de todas as tabelas do banco, lido por SQL direto,
antes e depois da requisição.

Fotos: os geradores incluem data URLs perto de 2 097 152 bytes (≈2,8 MB de
JSON por requisição). Os 100 exemplos ainda rodam em tempo razoável, então o
número de exemplos não foi reduzido.
"""

from __future__ import annotations

from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import inspect, text

from app.autenticacao.servico import criar_sessao, criar_usuario, pedir_redefinicao
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import (
    descricoes_invalidas,
    descricoes_validas,
    emails_invalidos,
    emails_validos,
    fotos_invalidas,
    fotos_validas,
    nomes_invalidos,
    nomes_validos,
    senhas_invalidas,
    senhas_validas,
    usernames_invalidos,
    usernames_validos,
    variacoes_de_email,
)

URL_PERFIL = "/api/v1/usuarios/me"
URL_CADASTRO = "/api/v1/auth/cadastro"
TTL_MINUTOS = 60

CAMPOS_PERFIL = ("name", "username", "description", "photo")
CAMPOS_CADASTRO = ("name", "email", "password")

# Usuario dono da Sessao (o que edita o perfil) e um segundo Usuario, cujo
# username pode aparecer como valor "válido" na edição.
EMAIL_DONO = "dono@exemplo.com"
SENHA_DONO = "senha-do-dono-123"
EMAIL_OUTRO = "outro@exemplo.com"
USERNAME_OUTRO = "Outro.Usuario"


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


def _assert_422_com_campos(resposta, esperados: frozenset[str]) -> None:
    assert resposta.status_code == 422, resposta.text
    corpo = resposta.json()
    assert set(corpo) == {"error"}, corpo
    erro = corpo["error"]
    assert erro["code"] == "validacao"
    nomes = [item["field"] for item in erro["fields"]]
    assert len(nomes) == len(set(nomes)), f"campo repetido em {nomes!r}"
    assert set(nomes) == esperados
    for item in erro["fields"]:
        assert isinstance(item["message"], str) and item["message"]


def _subconjuntos_nao_vazios(campos: tuple[str, ...]) -> st.SearchStrategy[frozenset[str]]:
    return st.sets(st.sampled_from(campos), min_size=1).map(frozenset)


# --- Edição de perfil ---------------------------------------------------------


def _username_valido() -> st.SearchStrategy[str]:
    """Username válido; às vezes o de outro Usuario (com outra caixa)."""
    do_outro = st.lists(st.booleans(), min_size=len(USERNAME_OUTRO), max_size=len(USERNAME_OUTRO)).map(
        lambda m: "".join(c.upper() if u else c.lower() for c, u in zip(USERNAME_OUTRO, m))
    )
    return st.one_of(usernames_validos(), do_outro)


_VALIDOS_PERFIL = {
    "name": nomes_validos(),
    "username": _username_valido(),
    "description": st.one_of(st.none(), descricoes_validas()),
    "photo": st.one_of(st.none(), fotos_validas()),
}
_INVALIDOS_PERFIL = {
    "name": nomes_invalidos(),
    "username": usernames_invalidos(),
    "description": descricoes_invalidas(),
    "photo": fotos_invalidas(),
}


@st.composite
def _cenario_perfil(draw):
    invalidos = draw(_subconjuntos_nao_vazios(CAMPOS_PERFIL))
    corpo = {
        campo: draw(_INVALIDOS_PERFIL[campo] if campo in invalidos else _VALIDOS_PERFIL[campo])
        for campo in CAMPOS_PERFIL
    }
    return invalidos, corpo


def _preparar_perfil(ctx) -> str:
    """Dono com perfil preenchido + Sessao, outro Usuario e um TokenRedefinicao.

    Devolve o Token_Sessao do dono. Todas as sessões de banco são fechadas antes
    de a API ser chamada.
    """
    with ctx.sessao() as db:
        dono = criar_usuario(db, "Dono", EMAIL_DONO, SENHA_DONO, INSTANTE_INICIAL)
        dono.username = "dono.original"
        dono.username_normalizado = "dono.original"
        dono.descricao = "Descrição original"
        dono.foto = "data:image/png;base64,QUJD"
        db.commit()
        _, token = criar_sessao(db, dono, INSTANTE_INICIAL, TTL_MINUTOS)

        outro = criar_usuario(db, "Outro", EMAIL_OUTRO, "senha-do-outro-1", INSTANTE_INICIAL)
        outro.username = USERNAME_OUTRO
        outro.username_normalizado = USERNAME_OUTRO.lower()
        db.commit()

        pedir_redefinicao(db, EMAIL_DONO, INSTANTE_INICIAL, ctx.config)
    return token


@settings(max_examples=100, deadline=None)
@given(cenario=_cenario_perfil())
def test_edicao_de_perfil_invalida_e_rejeitada_por_inteiro(criar_app_isolada, cenario):
    invalidos, corpo = cenario
    with criar_app_isolada() as ctx:
        token = _preparar_perfil(ctx)
        ctx.relogio.avancar(timedelta(minutes=5))
        antes = _instantaneo(ctx)

        resposta = ctx.cliente.patch(
            URL_PERFIL, json=corpo, headers={"Authorization": f"Bearer {token}"}
        )

        _assert_422_com_campos(resposta, invalidos)
        assert _instantaneo(ctx) == antes


# --- Cadastro -----------------------------------------------------------------

EMAIL_CADASTRADO = "ja.existe@exemplo.com"

_VALIDOS_CADASTRO = {
    "name": nomes_validos(),
    # Às vezes o e-mail já cadastrado (em qualquer caixa): 422 vem antes do 409.
    "email": st.one_of(emails_validos(), variacoes_de_email(EMAIL_CADASTRADO)),
    "password": senhas_validas(),
}
_INVALIDOS_CADASTRO = {
    "name": nomes_invalidos(),
    "email": emails_invalidos(),
    "password": senhas_invalidas(),
}


@st.composite
def _cenario_cadastro(draw):
    invalidos = draw(_subconjuntos_nao_vazios(CAMPOS_CADASTRO))
    corpo = {
        campo: draw(_INVALIDOS_CADASTRO[campo] if campo in invalidos else _VALIDOS_CADASTRO[campo])
        for campo in CAMPOS_CADASTRO
    }
    return invalidos, corpo


def _preparar_cadastro(ctx) -> None:
    """Um Usuario já cadastrado com uma Sessao, para que as contagens não sejam zero."""
    with ctx.sessao() as db:
        usuario = criar_usuario(db, "Existente", EMAIL_CADASTRADO, "senha-existente", INSTANTE_INICIAL)
        criar_sessao(db, usuario, INSTANTE_INICIAL, TTL_MINUTOS)


@settings(max_examples=100, deadline=None)
@given(cenario=_cenario_cadastro())
def test_cadastro_invalido_e_rejeitado_por_inteiro(criar_app_isolada, cenario):
    invalidos, corpo = cenario
    with criar_app_isolada() as ctx:
        _preparar_cadastro(ctx)
        ctx.relogio.avancar(timedelta(minutes=5))
        antes = _instantaneo(ctx)
        assert len(antes["usuario"]) == 1 and len(antes["sessao"]) == 1

        resposta = ctx.cliente.post(URL_CADASTRO, json=corpo)

        _assert_422_com_campos(resposta, invalidos)  # corpo só com "error": sem token
        assert _instantaneo(ctx) == antes


# Exemplo fixo: os três campos do cadastro inválidos ao mesmo tempo.
def test_cadastro_com_os_tres_campos_invalidos_lista_os_tres(app_isolada):
    _preparar_cadastro(app_isolada)
    antes = _instantaneo(app_isolada)
    resposta = app_isolada.cliente.post(
        URL_CADASTRO, json={"name": "   ", "email": "sem-arroba", "password": "curta"}
    )
    _assert_422_com_campos(resposta, frozenset(CAMPOS_CADASTRO))
    assert _instantaneo(app_isolada) == antes
