"""Testes de exemplo de perfil e troca de senha (tarefa 8.5).

Casos concretos de ``GET /api/v1/usuarios/me``, ``PATCH /api/v1/usuarios/me`` e
``PUT /api/v1/usuarios/me/senha``: limites exatos (nome 60, username 30,
descrição 160, foto de 2 097 152 bytes), conflito de username, campos extras,
precedência do 422 sobre a senha atual errada e falha de persistência injetada
em ``Session.commit``. As regras gerais já são cobertas pelas Properties 3, 4,
6, 7, 19 e 20; aqui ficam os exemplos de cada critério.

_Requisitos: 6.2, 7.2, 7.3, 7.4, 7.5, 7.8, 7.9, 8.4, 8.5, 8.6, 8.7, 8.8, 13.12_
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.autenticacao.modelo import Sessao, Usuario
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import foto_data_url

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_LOGIN = "/api/v1/auth/login"
URL_PERFIL = "/api/v1/usuarios/me"
URL_SENHA = "/api/v1/usuarios/me/senha"

EMAIL = "ana@exemplo.com"
SENHA = "senha-da-ana-1"
NOVA_SENHA = "nova-senha-da-ana-2"
EMAIL_OUTRO = "bia@exemplo.com"
SENHA_OUTRO = "senha-da-bia-1"

FOTO_MAX = 2_097_152
CHAVES_PERFIL = {
    "id", "name", "username", "email", "description", "photo",
    "isCommunityAdmin", "isSystemAdmin", "createdAt", "updatedAt",
}

TABELA_USUARIO = Usuario.__table__
TABELA_SESSAO = Sessao.__table__
_VERIFICADOR = PasswordHasher()


# --- Auxiliares ---------------------------------------------------------------


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _iso(instante: datetime) -> str:
    return instante.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _cadastrar(cliente, email: str = EMAIL, nome: str = "Ana", senha: str = SENHA) -> dict:
    resposta = cliente.post(URL_CADASTRO, json={"email": email, "name": nome, "password": senha})
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _login(cliente, email: str = EMAIL, senha: str = SENHA) -> str:
    resposta = cliente.post(URL_LOGIN, json={"email": email, "password": senha})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()["token"]


def _linha_usuario(app_isolada, usuario_id: str) -> dict:
    with app_isolada.sessao() as db:
        linha = db.execute(
            select(TABELA_USUARIO).where(TABELA_USUARIO.c.id == usuario_id)
        ).mappings().one()
        return dict(linha)


def _sessoes(app_isolada) -> dict[str, dict]:
    """Todas as linhas de ``sessao`` (de todos os Usuarios), por ``id``."""
    with app_isolada.sessao() as db:
        return {
            linha["id"]: dict(linha)
            for linha in db.execute(select(TABELA_SESSAO)).mappings().all()
        }


def _confere(hash_senha: str, senha: str) -> bool:
    try:
        return _VERIFICADOR.verify(hash_senha, senha)
    except VerificationError:
        return False


def _campos(resposta) -> list[str]:
    return [campo["field"] for campo in resposta.json()["error"]["fields"]]


def _perfil_valido(**sobrescritas) -> dict:
    corpo = {"name": "Ana Souza", "username": "ana.souza", "description": "", "photo": ""}
    corpo.update(sobrescritas)
    return corpo


def _falhar_commit(monkeypatch) -> None:
    """Faz todo ``Session.commit`` lançar ``OperationalError`` (falha de persistência)."""

    def commit_com_falha(self):
        raise OperationalError("COMMIT", {}, Exception("disco cheio (simulado)"))

    monkeypatch.setattr(Session, "commit", commit_com_falha)


# --- GET /usuarios/me (6.2) ---------------------------------------------------


def test_get_me_devolve_o_perfil_publico_do_dono_da_sessao(app_isolada, cliente):
    cadastro = _cadastrar(cliente, nome="  Ana Lima  ")
    _cadastrar(cliente, email=EMAIL_OUTRO, nome="Bia", senha=SENHA_OUTRO)

    resposta = cliente.get(URL_PERFIL, headers=_bearer(cadastro["token"]))

    assert resposta.status_code == 200, resposta.text
    perfil = resposta.json()
    assert set(perfil) == CHAVES_PERFIL
    assert perfil == cadastro["user"]
    assert perfil["name"] == "Ana Lima"
    assert perfil["username"] == "ana"
    assert perfil["email"] == EMAIL
    assert perfil["description"] == ""
    assert perfil["photo"] == ""
    assert perfil["isCommunityAdmin"] is False
    assert perfil["isSystemAdmin"] is False
    assert perfil["createdAt"] == perfil["updatedAt"] == _iso(INSTANTE_INICIAL)
    # Sem Hash_Senha nem dados de Sessao em nenhum valor.
    linha = _linha_usuario(app_isolada, perfil["id"])
    assert linha["hash_senha"] not in resposta.text
    assert cadastro["token"] not in resposta.text
    assert SENHA not in resposta.text


@pytest.mark.parametrize(
    ("metodo", "url", "corpo"),
    [
        ("GET", URL_PERFIL, None),
        ("PATCH", URL_PERFIL, _perfil_valido()),
        ("PUT", URL_SENHA, {"currentPassword": SENHA, "newPassword": NOVA_SENHA}),
    ],
)
@pytest.mark.parametrize(
    "cabecalhos",
    [{}, {"Authorization": "Bearer token-que-nao-existe"}],
    ids=["sem-authorization", "token-desconhecido"],
)
def test_endpoints_de_conta_sem_sessao_respondem_401_sem_alterar_nada(
    app_isolada, cliente, metodo, url, corpo, cabecalhos
):
    usuario_id = _cadastrar(cliente)["user"]["id"]
    antes_usuario = _linha_usuario(app_isolada, usuario_id)
    antes_sessoes = _sessoes(app_isolada)
    app_isolada.relogio.avancar(minutes=5)

    resposta = cliente.request(metodo, url, json=corpo, headers=cabecalhos)

    assert resposta.status_code == 401, resposta.text
    assert resposta.headers["WWW-Authenticate"] == "Bearer"
    assert resposta.json()["error"]["code"] == "sessao_invalida"
    assert _linha_usuario(app_isolada, usuario_id) == antes_usuario
    assert _sessoes(app_isolada) == antes_sessoes


# --- PATCH /usuarios/me (7.2, 7.3, 7.8) ---------------------------------------


def test_patch_com_valores_validos_nos_limites_grava_e_volta_igual(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    token = cadastro["token"]
    usuario_id = cadastro["user"]["id"]
    antes = _linha_usuario(app_isolada, usuario_id)
    agora = app_isolada.relogio.avancar(hours=1)

    nome = "N" * 60
    username = "a.b_" + "c" * 26  # 30 caracteres
    descricao = "d" * 160
    foto = foto_data_url(FOTO_MAX)  # exatamente 2 097 152 bytes decodificados
    corpo = {"name": f"  {nome}\t ", "username": username, "description": descricao, "photo": foto}

    resposta = cliente.patch(URL_PERFIL, json=corpo, headers=_bearer(token))

    assert resposta.status_code == 200, resposta.text[:500]
    perfil = resposta.json()
    assert perfil["name"] == nome
    assert perfil["username"] == username
    assert perfil["description"] == descricao
    assert perfil["photo"] == foto
    assert perfil["updatedAt"] == _iso(agora)
    assert perfil["createdAt"] == _iso(INSTANTE_INICIAL)

    linha = _linha_usuario(app_isolada, usuario_id)
    assert linha == {
        **antes,
        "nome": nome,
        "username": username,
        "username_normalizado": username.lower(),
        "descricao": descricao,
        "foto": foto,
        "atualizado_em": agora,
    }

    # Ida e volta (7.8): a consulta devolve exatamente o que foi salvo.
    consulta = cliente.get(URL_PERFIL, headers=_bearer(token))
    assert consulta.status_code == 200
    assert consulta.json() == perfil


def test_patch_com_descricao_e_foto_nulas_grava_texto_vazio(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    token = cadastro["token"]
    primeira = cliente.patch(
        URL_PERFIL,
        json=_perfil_valido(description="Oi", photo=foto_data_url(10)),
        headers=_bearer(token),
    )
    assert primeira.status_code == 200, primeira.text

    resposta = cliente.patch(
        URL_PERFIL, json=_perfil_valido(description=None, photo=None), headers=_bearer(token)
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["description"] == ""
    assert resposta.json()["photo"] == ""
    linha = _linha_usuario(app_isolada, cadastro["user"]["id"])
    assert linha["descricao"] == ""
    assert linha["foto"] == ""


def test_patch_ignora_campos_extras(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    token = cadastro["token"]
    usuario_id = cadastro["user"]["id"]
    antes = _linha_usuario(app_isolada, usuario_id)
    agora = app_isolada.relogio.avancar(minutes=10)

    corpo = {
        **_perfil_valido(),
        "email": "outro@exemplo.com",
        "password": "senha-trocada-1",
        "newPassword": "senha-trocada-2",
        "isCommunityAdmin": True,
        "isSystemAdmin": True,
        "id": "00000000-0000-4000-8000-000000000000",
        "createdAt": "2000-01-01T00:00:00Z",
        "hashSenha": "x",
    }
    resposta = cliente.patch(URL_PERFIL, json=corpo, headers=_bearer(token))

    assert resposta.status_code == 200, resposta.text
    perfil = resposta.json()
    assert perfil["id"] == usuario_id
    assert perfil["email"] == EMAIL
    assert perfil["isCommunityAdmin"] is False
    assert perfil["isSystemAdmin"] is False
    assert perfil["createdAt"] == _iso(INSTANTE_INICIAL)

    linha = _linha_usuario(app_isolada, usuario_id)
    for coluna in ("id", "email", "hash_senha", "is_community_admin", "is_system_admin", "criado_em"):
        assert linha[coluna] == antes[coluna], coluna
    assert linha["nome"] == "Ana Souza"
    assert linha["atualizado_em"] == agora
    # A senha continua a mesma.
    _login(cliente, EMAIL, SENHA)


def test_patch_com_username_de_outro_usuario_responde_409_sem_alterar(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    outro = _cadastrar(cliente, email=EMAIL_OUTRO, nome="Bia", senha=SENHA_OUTRO)
    assert outro["user"]["username"] == "bia"
    usuario_id = cadastro["user"]["id"]
    antes = _linha_usuario(app_isolada, usuario_id)
    antes_outro = _linha_usuario(app_isolada, outro["user"]["id"])
    app_isolada.relogio.avancar(minutes=1)

    resposta = cliente.patch(
        URL_PERFIL,
        json=_perfil_valido(name="Ana Nova", username="BIA", description="nova"),
        headers=_bearer(cadastro["token"]),
    )

    assert resposta.status_code == 409, resposta.text
    assert resposta.json()["error"]["code"] == "username_em_uso"
    assert _linha_usuario(app_isolada, usuario_id) == antes
    assert _linha_usuario(app_isolada, outro["user"]["id"]) == antes_outro


def test_patch_aceita_o_proprio_username_com_outra_caixa(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    assert cadastro["user"]["username"] == "ana"

    resposta = cliente.patch(
        URL_PERFIL, json=_perfil_valido(username="AnA"), headers=_bearer(cadastro["token"])
    )

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["username"] == "AnA"
    linha = _linha_usuario(app_isolada, cadastro["user"]["id"])
    assert linha["username"] == "AnA"
    assert linha["username_normalizado"] == "ana"


# --- PATCH /usuarios/me: 422 sem gravação parcial (7.5) ------------------------


@pytest.mark.parametrize(
    ("sobrescritas", "campos_esperados"),
    [
        ({"name": "   "}, ["name"]),
        ({"name": "N" * 61}, ["name"]),
        ({"username": ""}, ["username"]),
        ({"username": "u" * 31}, ["username"]),
        ({"username": "ana souza"}, ["username"]),
        ({"description": "d" * 161}, ["description"]),
        ({"photo": foto_data_url(FOTO_MAX + 1)}, ["photo"]),
        ({"photo": "https://exemplo.com/foto.png"}, ["photo"]),
        ({"photo": "data:text/plain;base64,QUJD"}, ["photo"]),
        (
            {"name": "", "username": "a-b", "description": "d" * 161, "photo": "data:image/png;base64,%%"},
            ["name", "username", "description", "photo"],
        ),
    ],
    ids=[
        "nome-so-espacos", "nome-61", "username-vazio", "username-31", "username-com-espaco",
        "descricao-161", "foto-1-byte-a-mais", "foto-url", "foto-nao-imagem", "quatro-invalidos",
    ],
)
def test_patch_invalido_responde_422_com_cada_campo_e_nao_grava_nada(
    app_isolada, cliente, sobrescritas, campos_esperados
):
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    antes = _linha_usuario(app_isolada, usuario_id)
    app_isolada.relogio.avancar(minutes=1)
    # Os campos válidos diferem dos atuais: não podem ser gravados parcialmente.
    corpo = _perfil_valido(description="descrição nova", photo=foto_data_url(16))
    corpo.update(sobrescritas)

    resposta = cliente.patch(URL_PERFIL, json=corpo, headers=_bearer(cadastro["token"]))

    assert resposta.status_code == 422, resposta.text[:500]
    assert resposta.json()["error"]["code"] == "validacao"
    assert sorted(_campos(resposta)) == sorted(campos_esperados)
    assert _linha_usuario(app_isolada, usuario_id) == antes


def test_patch_sem_um_dos_quatro_campos_responde_422(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    antes = _linha_usuario(app_isolada, usuario_id)
    corpo = _perfil_valido()
    del corpo["photo"]

    resposta = cliente.patch(URL_PERFIL, json=corpo, headers=_bearer(cadastro["token"]))

    assert resposta.status_code == 422, resposta.text
    assert "photo" in _campos(resposta)
    assert _linha_usuario(app_isolada, usuario_id) == antes


def test_patch_com_falha_ao_salvar_responde_500_e_mantem_o_usuario(
    app_isolada, monkeypatch
):
    cliente = app_isolada.novo_cliente(raise_server_exceptions=False)
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    antes = _linha_usuario(app_isolada, usuario_id)
    app_isolada.relogio.avancar(minutes=1)

    _falhar_commit(monkeypatch)
    resposta = cliente.patch(
        URL_PERFIL,
        json=_perfil_valido(description="nova", photo=foto_data_url(8)),
        headers=_bearer(cadastro["token"]),
    )
    monkeypatch.undo()

    assert resposta.status_code == 500, resposta.text
    assert resposta.json()["error"]["code"] == "falha_ao_salvar"
    assert _linha_usuario(app_isolada, usuario_id) == antes
    consulta = cliente.get(URL_PERFIL, headers=_bearer(cadastro["token"]))
    assert consulta.status_code == 200
    assert consulta.json() == cadastro["user"]


# --- PUT /usuarios/me/senha (8.4, 8.5, 8.7) -----------------------------------


def test_troca_de_senha_responde_204_revoga_as_outras_sessoes_e_mantem_a_atual(
    app_isolada, cliente
):
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    token_cadastro = cadastro["token"]
    token_atual = _login(cliente)
    token_terceiro = _login(cliente)
    cadastro_outro = _cadastrar(cliente, email=EMAIL_OUTRO, nome="Bia", senha=SENHA_OUTRO)
    token_outro = cadastro_outro["token"]
    antes_outro = _linha_usuario(app_isolada, cadastro_outro["user"]["id"])
    sessoes_antes = _sessoes(app_isolada)
    agora = app_isolada.relogio.avancar(hours=2)

    resposta = cliente.put(
        URL_SENHA,
        json={"currentPassword": SENHA, "newPassword": NOVA_SENHA},
        headers=_bearer(token_atual),
    )

    assert resposta.status_code == 204, resposta.text
    assert resposta.content == b""

    linha = _linha_usuario(app_isolada, usuario_id)
    assert _confere(linha["hash_senha"], NOVA_SENHA)
    assert not _confere(linha["hash_senha"], SENHA)
    assert linha["atualizado_em"] == agora
    assert linha["criado_em"] == INSTANTE_INICIAL

    sessoes_depois = _sessoes(app_isolada)
    assert set(sessoes_depois) == set(sessoes_antes)
    revogadas = {i for i, s in sessoes_depois.items() if s["revogada_em"] is not None}
    do_usuario = {i for i, s in sessoes_depois.items() if s["usuario_id"] == usuario_id}
    assert len(do_usuario) == 3
    assert len(revogadas) == 2 and revogadas < do_usuario
    assert all(sessoes_depois[i]["revogada_em"] == agora for i in revogadas)
    # Sessoes do outro Usuario não mudam.
    for i, s in sessoes_depois.items():
        if s["usuario_id"] != usuario_id:
            assert s == sessoes_antes[i]
    assert _linha_usuario(app_isolada, antes_outro["id"]) == antes_outro

    assert cliente.get(URL_PERFIL, headers=_bearer(token_atual)).status_code == 200
    for token in (token_cadastro, token_terceiro):
        perfil = cliente.get(URL_PERFIL, headers=_bearer(token))
        assert perfil.status_code == 401
        assert perfil.json()["error"]["code"] == "sessao_invalida"
    assert cliente.get(URL_PERFIL, headers=_bearer(token_outro)).status_code == 200

    # 8.7: a nova senha entra, a anterior não.
    antiga = cliente.post(URL_LOGIN, json={"email": EMAIL, "password": SENHA})
    assert antiga.status_code == 401
    assert antiga.json()["error"]["code"] == "credenciais_invalidas"
    nova = cliente.post(URL_LOGIN, json={"email": EMAIL, "password": NOVA_SENHA})
    assert nova.status_code == 200, nova.text
    assert nova.json()["user"]["id"] == usuario_id


@pytest.mark.parametrize("tamanho", [8, 128])
def test_troca_de_senha_aceita_os_limites_de_tamanho(app_isolada, cliente, tamanho):
    token = _cadastrar(cliente)["token"]
    nova = "s" * tamanho

    resposta = cliente.put(
        URL_SENHA, json={"currentPassword": SENHA, "newPassword": nova}, headers=_bearer(token)
    )

    assert resposta.status_code == 204, resposta.text
    _login(cliente, EMAIL, nova)


# --- PUT /usuarios/me/senha recusado (8.6, 8.8) --------------------------------


def test_senha_atual_incorreta_responde_400_sem_alterar_nada(app_isolada, cliente):
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    _login(cliente)
    antes = _linha_usuario(app_isolada, usuario_id)
    sessoes_antes = _sessoes(app_isolada)
    app_isolada.relogio.avancar(minutes=1)

    resposta = cliente.put(
        URL_SENHA,
        json={"currentPassword": "senha-errada-1", "newPassword": NOVA_SENHA},
        headers=_bearer(cadastro["token"]),
    )

    assert resposta.status_code == 400, resposta.text
    assert resposta.json()["error"]["code"] == "senha_atual_incorreta"
    assert _linha_usuario(app_isolada, usuario_id) == antes
    assert _sessoes(app_isolada) == sessoes_antes
    _login(cliente, EMAIL, SENHA)


@pytest.mark.parametrize("tamanho", [0, 7, 129])
@pytest.mark.parametrize("senha_atual", [SENHA, "senha-errada-1"], ids=["atual-certa", "atual-errada"])
def test_nova_senha_fora_do_tamanho_responde_422_com_precedencia(
    app_isolada, cliente, tamanho, senha_atual
):
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    _login(cliente)
    antes = _linha_usuario(app_isolada, usuario_id)
    sessoes_antes = _sessoes(app_isolada)
    app_isolada.relogio.avancar(minutes=1)

    resposta = cliente.put(
        URL_SENHA,
        json={"currentPassword": senha_atual, "newPassword": "n" * tamanho},
        headers=_bearer(cadastro["token"]),
    )

    # 422 mesmo com a senha atual errada (8.8 tem precedência sobre 8.6).
    assert resposta.status_code == 422, resposta.text
    assert resposta.json()["error"]["code"] == "validacao"
    assert _campos(resposta) == ["newPassword"]
    assert _linha_usuario(app_isolada, usuario_id) == antes
    assert _sessoes(app_isolada) == sessoes_antes


def test_troca_de_senha_com_falha_ao_salvar_desfaz_tudo(app_isolada, monkeypatch):
    cliente = app_isolada.novo_cliente(raise_server_exceptions=False)
    cadastro = _cadastrar(cliente)
    usuario_id = cadastro["user"]["id"]
    token_outro_dispositivo = _login(cliente)
    antes = _linha_usuario(app_isolada, usuario_id)
    sessoes_antes = _sessoes(app_isolada)
    app_isolada.relogio.avancar(timedelta(minutes=3))

    _falhar_commit(monkeypatch)
    resposta = cliente.put(
        URL_SENHA,
        json={"currentPassword": SENHA, "newPassword": NOVA_SENHA},
        headers=_bearer(cadastro["token"]),
    )
    monkeypatch.undo()

    assert resposta.status_code == 500, resposta.text
    assert resposta.json()["error"]["code"] == "falha_ao_salvar"
    assert _linha_usuario(app_isolada, usuario_id) == antes
    assert _sessoes(app_isolada) == sessoes_antes
    assert cliente.get(URL_PERFIL, headers=_bearer(token_outro_dispositivo)).status_code == 200
    _login(cliente, EMAIL, SENHA)
