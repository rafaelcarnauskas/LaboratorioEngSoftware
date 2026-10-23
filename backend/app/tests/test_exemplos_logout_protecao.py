"""Testes de exemplo de logout, proteção e contrato para as outras partes (tarefa 8.6).

Casos concretos de ``POST /api/v1/auth/logout``, da exigência de Sessao_Valida
(``obter_sessao_atual`` / ``obter_usuario_atual``) e do contrato do
Servico_Usuario (``buscar_por_id`` e ``buscar_usuario``). As regras gerais já
são cobertas pelas Properties 11, 12 e 13; aqui ficam os exemplos de cada
critério.

O contrato das partes 2 a 5 é exercitado com um router temporário, criado só
dentro do teste e incluído na ``AppIsolada`` com
``dependencies=[Depends(obter_usuario_atual)]``, exatamente como ``main.py``
deve incluir os routers dessas partes. Nada é afirmado sobre os routers já
registrados pelos colegas (``comunidades``, ``historico``) nem sobre o
``/health``.

_Requisitos: 9.3, 9.4, 9.7, 9.8, 9.9, 10.2, 10.3, 11.1, 11.2, 11.3, 11.4, 13.12_
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Annotated

import pytest
from fastapi import APIRouter, Depends
from pydantic import ValidationError
from sqlalchemy import select

from app.autenticacao import api as api_autenticacao
from app.autenticacao.api import PerfilPublico, obter_usuario_atual
from app.autenticacao.modelo import Sessao, Usuario
from app.autenticacao.servico import buscar_por_id, buscar_usuario
from app.core import seguranca

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_LOGIN = "/api/v1/auth/login"
URL_LOGOUT = "/api/v1/auth/logout"
URL_PERFIL = "/api/v1/usuarios/me"
URL_SENHA = "/api/v1/usuarios/me/senha"
URL_CONTRATO = "/api/v1/teste-contrato/eu"
URL_CONTRATO_ACAO = "/api/v1/teste-contrato/acao"

EMAIL = "ana@exemplo.com"
SENHA = "senha-da-ana-1"
EMAIL_OUTRO = "bia@exemplo.com"
SENHA_OUTRO = "senha-da-bia-1"

CODIGO_SESSAO_INVALIDA = "sessao_invalida"
TTL_PADRAO = timedelta(minutes=10080)

CHAVES_PERFIL = {
    "id", "name", "username", "email", "description", "photo",
    "isCommunityAdmin", "isSystemAdmin", "createdAt", "updatedAt",
}

TABELA_USUARIO = Usuario.__table__
TABELA_SESSAO = Sessao.__table__


# --- Auxiliares ---------------------------------------------------------------


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _cadastrar(cliente, email: str = EMAIL, nome: str = "Ana", senha: str = SENHA) -> dict:
    resposta = cliente.post(URL_CADASTRO, json={"email": email, "name": nome, "password": senha})
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _login(cliente, email: str = EMAIL, senha: str = SENHA) -> str:
    resposta = cliente.post(URL_LOGIN, json={"email": email, "password": senha})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()["token"]


def _tabela(app_isolada, tabela) -> dict[str, dict]:
    """Todas as linhas de ``tabela``, por ``id``, lidas numa Session própria."""
    with app_isolada.sessao() as db:
        return {
            linha["id"]: dict(linha)
            for linha in db.execute(select(tabela)).mappings().all()
        }


def _sessoes(app_isolada) -> dict[str, dict]:
    return _tabela(app_isolada, TABELA_SESSAO)


def _usuarios(app_isolada) -> dict[str, dict]:
    return _tabela(app_isolada, TABELA_USUARIO)


def _id_da_sessao(app_isolada, token: str) -> str:
    """``id`` da Sessao do ``token``, encontrada pelo hash SHA-256 gravado no banco."""
    with app_isolada.sessao() as db:
        return db.scalars(
            select(Sessao.id).where(Sessao.token_hash == seguranca.hash_token(token))
        ).one()


def _assert_sessao_invalida(resposta) -> None:
    """``401 sessao_invalida`` com ``WWW-Authenticate: Bearer`` e sem dados do recurso."""
    assert resposta.status_code == 401, resposta.text
    assert resposta.headers.get("www-authenticate") == "Bearer"
    corpo = resposta.json()
    assert set(corpo) == {"error"}
    assert corpo["error"]["code"] == CODIGO_SESSAO_INVALIDA
    assert corpo["error"]["message"]


# --- Logout (9.3, 9.4, 9.7, 9.8, 9.9) -----------------------------------------


def test_logout_204_corpo_vazio_revoga_so_a_propria_sessao(app_isolada, cliente, relogio):
    cadastro = _cadastrar(cliente)
    token_cadastro = cadastro["token"]
    token_sair = _login(cliente)
    token_outro_aparelho = _login(cliente)
    token_bia = _cadastrar(cliente, email=EMAIL_OUTRO, nome="Bia", senha=SENHA_OUTRO)["token"]
    id_sair = _id_da_sessao(app_isolada, token_sair)
    antes = _sessoes(app_isolada)
    assert len(antes) == 4
    assert all(linha["revogada_em"] is None for linha in antes.values())

    instante_logout = relogio.avancar(minutes=7)
    resposta = cliente.post(URL_LOGOUT, headers=_bearer(token_sair))

    assert resposta.status_code == 204
    assert resposta.content == b""
    depois = _sessoes(app_isolada)
    assert depois[id_sair]["revogada_em"] == instante_logout
    assert {**depois[id_sair], "revogada_em": None} == antes[id_sair]
    for id_sessao, linha in antes.items():
        if id_sessao != id_sair:
            assert depois[id_sessao] == linha
    # As outras Sessoes (do mesmo Usuario e da outra conta) continuam válidas.
    for token in (token_cadastro, token_outro_aparelho, token_bia):
        assert cliente.get(URL_PERFIL, headers=_bearer(token)).status_code == 200
    _assert_sessao_invalida(cliente.get(URL_PERFIL, headers=_bearer(token_sair)))


def test_token_revogado_continua_invalido_antes_e_depois_de_expira_em(
    app_isolada, cliente, relogio
):
    token = _cadastrar(cliente)["token"]
    id_sessao = _id_da_sessao(app_isolada, token)
    expira_em = _sessoes(app_isolada)[id_sessao]["expira_em"]
    assert expira_em == relogio.agora() + TTL_PADRAO

    instante_logout = relogio.avancar(minutes=1)
    assert cliente.post(URL_LOGOUT, headers=_bearer(token)).status_code == 204

    instantes = (
        instante_logout,                       # logo após o logout
        expira_em - timedelta(seconds=1),      # ainda antes de expira_em
        expira_em,                             # exatamente em expira_em
        expira_em + timedelta(days=30),        # bem depois de expira_em
    )
    for instante in instantes:
        relogio.definir(instante)
        _assert_sessao_invalida(cliente.get(URL_PERFIL, headers=_bearer(token)))
        _assert_sessao_invalida(cliente.post(URL_LOGOUT, headers=_bearer(token)))
        assert _sessoes(app_isolada)[id_sessao]["revogada_em"] == instante_logout


def _token_revogado(app_isolada, cliente, relogio) -> dict[str, str]:
    token = _login(cliente)
    assert cliente.post(URL_LOGOUT, headers=_bearer(token)).status_code == 204
    relogio.avancar(minutes=3)
    return _bearer(token)


def _token_desconhecido(app_isolada, cliente, relogio) -> dict[str, str]:
    return _bearer("token-que-nunca-foi-emitido-" + "x" * 32)


def _token_expirado(app_isolada, cliente, relogio) -> dict[str, str]:
    token = _login(cliente)
    id_sessao = _id_da_sessao(app_isolada, token)
    relogio.definir(_sessoes(app_isolada)[id_sessao]["expira_em"])  # expira_em == agora
    return _bearer(token)


def _token_ausente(app_isolada, cliente, relogio) -> dict[str, str]:
    return {}


@pytest.mark.parametrize(
    "preparar",
    [_token_revogado, _token_desconhecido, _token_expirado, _token_ausente],
    ids=["revogado", "desconhecido", "expirado", "ausente"],
)
def test_logout_sem_sessao_valida_responde_401_sem_alterar_sessoes(
    app_isolada, cliente, relogio, preparar
):
    _cadastrar(cliente)
    _cadastrar(cliente, email=EMAIL_OUTRO, nome="Bia", senha=SENHA_OUTRO)
    cabecalhos = preparar(app_isolada, cliente, relogio)
    antes = _sessoes(app_isolada)

    resposta = cliente.post(URL_LOGOUT, headers=cabecalhos)

    _assert_sessao_invalida(resposta)
    assert _sessoes(app_isolada) == antes


# --- Exigência de Sessao_Valida (10.2) ----------------------------------------

# Cada variação devolve os cabeçalhos a enviar, recebendo um token válido da Ana.
VARIACOES_CABECALHO = {
    "sem_authorization": lambda token: {},
    "authorization_vazio": lambda token: {"Authorization": ""},
    "so_bearer": lambda token: {"Authorization": "Bearer"},
    "bearer_com_espaco": lambda token: {"Authorization": "Bearer "},
    "bearer_so_espacos": lambda token: {"Authorization": "Bearer     "},
    "token_sem_esquema": lambda token: {"Authorization": token},
    "esquema_basic": lambda token: {"Authorization": f"Basic {token}"},
    "esquema_token": lambda token: {"Authorization": f"Token {token}"},
    "token_com_sobra": lambda token: {"Authorization": f"Bearer {token} extra"},
    "token_truncado": lambda token: _bearer(token[:-1]),
    "token_desconhecido": lambda token: _bearer("desconhecido-" + "y" * 40),
}

ENDPOINTS_PROTEGIDOS = {
    "get_me": ("GET", URL_PERFIL, None),
    "patch_me": (
        "PATCH",
        URL_PERFIL,
        {"name": "Outro Nome", "username": "outro", "description": "x", "photo": ""},
    ),
    "put_senha": (
        "PUT",
        URL_SENHA,
        {"currentPassword": SENHA, "newPassword": "senha-nova-123"},
    ),
    "logout": ("POST", URL_LOGOUT, None),
}


@pytest.mark.parametrize("endpoint", list(ENDPOINTS_PROTEGIDOS))
@pytest.mark.parametrize("variacao", list(VARIACOES_CABECALHO))
def test_cabecalho_invalido_responde_401_com_www_authenticate_sem_alterar_dados(
    app_isolada, cliente, variacao, endpoint
):
    token = _cadastrar(cliente)["token"]
    metodo, url, corpo = ENDPOINTS_PROTEGIDOS[endpoint]
    usuarios_antes = _usuarios(app_isolada)
    sessoes_antes = _sessoes(app_isolada)

    resposta = cliente.request(metodo, url, headers=VARIACOES_CABECALHO[variacao](token), json=corpo)

    _assert_sessao_invalida(resposta)
    assert EMAIL not in resposta.text
    assert _usuarios(app_isolada) == usuarios_antes
    assert _sessoes(app_isolada) == sessoes_antes
    # O token válido continua funcionando: só a requisição malformada foi recusada.
    assert cliente.get(URL_PERFIL, headers=_bearer(token)).status_code == 200


# --- Contrato para as partes 2 a 5 (10.3, 11.4) -------------------------------


@pytest.fixture
def contrato(app_isolada, monkeypatch):
    """Router temporário de uma "outra parte", incluído como ``main.py`` deve incluir.

    Devolve um dicionário com as chamadas recebidas pelos endpoints
    (``"eu"`` e ``"acao"``) e os ids pedidos a ``buscar_por_id`` pela dependência.
    """
    registro: dict[str, list] = {"eu": [], "acao": [], "buscar_por_id": []}

    buscar_original = api_autenticacao.buscar_por_id

    def buscar_por_id_espiao(db, usuario_id):
        registro["buscar_por_id"].append(usuario_id)
        return buscar_original(db, usuario_id)

    monkeypatch.setattr(api_autenticacao, "buscar_por_id", buscar_por_id_espiao)

    router = APIRouter()

    @router.get("/teste-contrato/eu")
    def eu(usuario: Annotated[PerfilPublico, Depends(obter_usuario_atual)]) -> dict:
        registro["eu"].append(usuario)
        return usuario.model_dump(mode="json")

    @router.post("/teste-contrato/acao", status_code=201)
    def acao() -> dict:
        # Não declara o Usuario: a proteção vem só do `dependencies=` do router.
        registro["acao"].append(True)
        return {"ok": True}

    app_isolada.app.include_router(
        router, prefix="/api/v1", dependencies=[Depends(obter_usuario_atual)]
    )
    return registro


def test_rota_de_outra_parte_recebe_perfil_publico_sem_token_nem_hash(
    app_isolada, cliente, contrato
):
    cadastro = _cadastrar(cliente)
    token = cadastro["token"]
    perfil_me = cliente.get(URL_PERFIL, headers=_bearer(token)).json()
    contrato["buscar_por_id"].clear()

    resposta = cliente.get(URL_CONTRATO, headers=_bearer(token))

    assert resposta.status_code == 200, resposta.text
    assert resposta.json() == perfil_me == cadastro["user"]
    assert set(resposta.json()) == CHAVES_PERFIL
    assert len(contrato["eu"]) == 1
    usuario = contrato["eu"][0]
    assert type(usuario) is PerfilPublico
    assert usuario.id == cadastro["user"]["id"]
    # Obtido pelo Servico_Usuario (buscar_por_id) a partir do dono da Sessao.
    assert contrato["buscar_por_id"] and set(contrato["buscar_por_id"]) == {usuario.id}

    # Nada de Token_Sessao, hash do token ou Hash_Senha no objeto entregue à parte.
    linha_usuario = _usuarios(app_isolada)[usuario.id]
    (linha_sessao,) = _sessoes(app_isolada).values()
    despejo = repr(usuario.model_dump()) + usuario.model_dump_json()
    for segredo in (token, linha_sessao["token_hash"], linha_usuario["hash_senha"], SENHA):
        assert segredo not in despejo
    assert not {"token", "token_hash", "hash_senha", "password"} & set(usuario.model_dump())

    # Imutável: a parte não consegue alterar o Perfil_Publico recebido.
    with pytest.raises(ValidationError):
        usuario.is_system_admin = True

    acao = cliente.post(URL_CONTRATO_ACAO, headers=_bearer(token))
    assert acao.status_code == 201
    assert contrato["acao"] == [True]


@pytest.mark.parametrize(
    "preparar",
    [_token_revogado, _token_desconhecido, _token_expirado, _token_ausente],
    ids=["revogado", "desconhecido", "expirado", "ausente"],
)
def test_rota_de_outra_parte_nao_executa_sem_sessao_valida(
    app_isolada, cliente, relogio, contrato, preparar
):
    _cadastrar(cliente)
    cabecalhos = preparar(app_isolada, cliente, relogio)
    sessoes_antes = _sessoes(app_isolada)
    usuarios_antes = _usuarios(app_isolada)

    _assert_sessao_invalida(cliente.get(URL_CONTRATO, headers=cabecalhos))
    _assert_sessao_invalida(cliente.post(URL_CONTRATO_ACAO, headers=cabecalhos))

    assert contrato["eu"] == []
    assert contrato["acao"] == []
    assert _sessoes(app_isolada) == sessoes_antes
    assert _usuarios(app_isolada) == usuarios_antes


# --- buscar_por_id e buscar_usuario (11.1, 11.2, 11.3) -------------------------


def test_buscar_por_id_com_id_existente_devolve_perfil_publico_sem_alterar_usuario(
    app_isolada, cliente, relogio
):
    cadastro = _cadastrar(cliente, nome="Ana Lima")
    usuario_id = cadastro["user"]["id"]
    antes = _usuarios(app_isolada)
    relogio.avancar(hours=2)

    with app_isolada.sessao() as db:
        perfil = buscar_por_id(db, usuario_id)
        assert not db.dirty and not db.new and not db.deleted

    assert isinstance(perfil, PerfilPublico)
    assert perfil.model_dump(mode="json", by_alias=True) == cadastro["user"]
    assert not {"hash_senha", "token", "token_hash"} & set(perfil.model_dump())
    assert antes[usuario_id]["hash_senha"] not in perfil.model_dump_json()
    assert _usuarios(app_isolada) == antes  # atualizado_em inclusive


@pytest.mark.parametrize(
    "usuario_id",
    [
        "",
        "   ",
        "abc",
        "nao-e-um-uuid",
        "' OR 1=1 --",
        "12345678-1234-1234-1234-1234567890a",    # um dígito a menos
        "12345678-1234-1234-1234-1234567890abc",  # um dígito a mais
        "g2345678-1234-1234-1234-1234567890ab",   # caractere fora do hexadecimal
        None,
        123,
        str(uuid.uuid4()),                         # bem formado, mas inexistente
    ],
    ids=[
        "vazio", "so_espacos", "curto", "texto", "injecao", "faltando_digito",
        "sobrando_digito", "nao_hex", "none", "inteiro", "inexistente",
    ],
)
def test_buscar_por_id_sem_usuario_devolve_none_sem_erro(app_isolada, cliente, usuario_id):
    usuario = _cadastrar(cliente)["user"]
    antes = _usuarios(app_isolada)

    with app_isolada.sessao() as db:
        assert buscar_por_id(db, usuario_id) is None
        assert not db.dirty and not db.new and not db.deleted

    assert usuario_id != usuario["id"]
    assert _usuarios(app_isolada) == antes


@pytest.mark.parametrize(
    "email",
    [EMAIL, "ANA@EXEMPLO.COM", "  Ana@Exemplo.Com  ", "\tana@exemplo.com\n"],
    ids=["igual", "maiusculas", "espacos_e_caixa", "tab_e_quebra"],
)
def test_buscar_usuario_normaliza_o_email_e_nao_altera_o_usuario(
    app_isolada, cliente, relogio, email
):
    usuario_id = _cadastrar(cliente)["user"]["id"]
    _cadastrar(cliente, email=EMAIL_OUTRO, nome="Bia", senha=SENHA_OUTRO)
    antes = _usuarios(app_isolada)
    relogio.avancar(hours=1)

    with app_isolada.sessao() as db:
        encontrado = buscar_usuario(db, email)
        assert encontrado is not None
        assert encontrado.id == usuario_id
        assert encontrado.email == EMAIL
        assert not db.dirty and not db.new and not db.deleted

    assert _usuarios(app_isolada) == antes


@pytest.mark.parametrize(
    "email",
    ["", "   ", "\t\n ", "carla@exemplo.com", "ana@exemplo.co", "ana", None],
    ids=["vazio", "espacos", "brancos_variados", "inexistente", "parecido", "sem_arroba", "none"],
)
def test_buscar_usuario_sem_correspondencia_devolve_none_sem_erro(app_isolada, cliente, email):
    _cadastrar(cliente)
    antes = _usuarios(app_isolada)

    with app_isolada.sessao() as db:
        assert buscar_usuario(db, email) is None
        assert not db.dirty and not db.new and not db.deleted

    assert _usuarios(app_isolada) == antes
