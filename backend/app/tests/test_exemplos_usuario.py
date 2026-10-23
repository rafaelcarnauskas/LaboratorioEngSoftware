"""Testes de exemplo da entidade Usuario (Requisito 1 e 13.12).

Casos concretos que complementam as propriedades de ``test_prop_*``: campos
persistidos e ``id`` imutável, e-mail normalizado e seus limites, e-mail e
username duplicados, Hash_Senha no lugar da senha, limites de nome, username,
descrição e foto, flags de administração no cadastro, ``criado_em`` /
``atualizado_em``, Perfil_Publico sem hash e falha de persistência.

O estado do banco é lido direto das tabelas (SQL ou ORM) numa ``Session``
própria, sempre fechada antes da próxima chamada à API.

**Validates: Requisitos 1.1–1.15, 13.12**
"""

from __future__ import annotations

from datetime import UTC, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.autenticacao.modelo import Usuario
from app.tests.estrategias import foto_data_url

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_LOGIN = "/api/v1/auth/login"
URL_PERFIL = "/api/v1/usuarios/me"
URL_SENHA = "/api/v1/usuarios/me/senha"
SENHA = "senha-segura-1"
TABELAS = ("usuario", "sessao", "token_redefinicao")
CHAVES_PERFIL = {
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
FOTO_MAX_BYTES = 2_097_152


# --- Apoio -------------------------------------------------------------------


def _cabecalho(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _cadastrar(ctx, email: str = "ana@email.com", nome: str = "Ana Silva", **extras) -> dict:
    resposta = ctx.cliente.post(
        URL_CADASTRO, json={"email": email, "name": nome, "password": SENHA, **extras}
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _perfil(nome="Ana Silva", username="ana", descricao="", foto="") -> dict:
    return {"name": nome, "username": username, "description": descricao, "photo": foto}


def _editar(ctx, token: str, **campos):
    return ctx.cliente.patch(URL_PERFIL, headers=_cabecalho(token), json=_perfil(**campos))


def _instantaneo(ctx) -> dict[str, list[tuple]]:
    """Todas as linhas das tabelas da Parte 1, lidas numa ``Session`` já fechada."""
    with ctx.sessao() as db:
        return {
            tabela: [
                tuple(linha)
                for linha in db.execute(text(f"SELECT * FROM {tabela} ORDER BY id"))
            ]
            for tabela in TABELAS
        }


def _usuario(ctx, usuario_id: str) -> Usuario:
    """Entidade Usuario relida do banco (desanexada; a ``Session`` é fechada)."""
    with ctx.sessao() as db:
        usuario = db.get(Usuario, usuario_id)
        assert usuario is not None
        db.expunge(usuario)
        return usuario


def _contar_usuarios(ctx) -> int:
    with ctx.sessao() as db:
        return db.execute(text("SELECT COUNT(*) FROM usuario")).scalar_one()


def _erro(resposta, status: int, codigo: str) -> dict:
    assert resposta.status_code == status, resposta.text
    corpo = resposta.json()
    assert corpo["error"]["code"] == codigo
    return corpo["error"]


def _campos(resposta) -> set[str]:
    erro = _erro(resposta, 422, "validacao")
    return {item["field"] for item in erro["fields"]}


def _email_com_tamanho(n: int) -> str:
    dominio = "@ex.com"
    return "a" * (n - len(dominio)) + dominio


# --- 1.1: campos persistidos e id imutável -----------------------------------


def test_cadastro_persiste_todos_os_campos_do_usuario(app_isolada):
    sessao = _cadastrar(app_isolada, email="ana@email.com", nome="Ana Silva")

    usuario = _usuario(app_isolada, sessao["user"]["id"])
    agora = app_isolada.relogio.agora()
    assert usuario.id == sessao["user"]["id"]
    assert len(usuario.id) == 36
    assert usuario.email == "ana@email.com"
    assert usuario.nome == "Ana Silva"
    assert usuario.username == "ana"
    assert usuario.username_normalizado == "ana"
    assert usuario.hash_senha
    assert usuario.descricao == ""
    assert usuario.foto == ""
    assert usuario.is_community_admin is False
    assert usuario.is_system_admin is False
    assert usuario.criado_em == agora
    assert usuario.atualizado_em == agora


def test_ids_sao_unicos_e_nao_mudam_apos_edicao_e_troca_de_senha(app_isolada):
    ana = _cadastrar(app_isolada, email="ana@email.com")
    bia = _cadastrar(app_isolada, email="bia@email.com", nome="Bia")
    assert ana["user"]["id"] != bia["user"]["id"]
    id_ana = ana["user"]["id"]

    app_isolada.relogio.avancar(minutes=5)
    resposta = _editar(app_isolada, ana["token"], nome="Ana Souza", username="ana.souza")
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["id"] == id_ana

    app_isolada.relogio.avancar(minutes=5)
    resposta = app_isolada.cliente.put(
        URL_SENHA,
        headers=_cabecalho(ana["token"]),
        json={"currentPassword": SENHA, "newPassword": "nova-senha-123"},
    )
    assert resposta.status_code == 204, resposta.text

    with app_isolada.sessao() as db:
        ids = set(db.scalars(select(Usuario.id)))
    assert ids == {id_ana, bia["user"]["id"]}
    resposta = app_isolada.cliente.get(URL_PERFIL, headers=_cabecalho(ana["token"]))
    assert resposta.status_code == 200
    assert resposta.json()["id"] == id_ana


# --- 1.2: e-mail normalizado e limites ----------------------------------------


def test_email_e_gravado_normalizado(app_isolada):
    sessao = _cadastrar(app_isolada, email="  Ana.Silva@Email.COM \t")

    assert sessao["user"]["email"] == "ana.silva@email.com"
    assert _usuario(app_isolada, sessao["user"]["id"]).email == "ana.silva@email.com"


@pytest.mark.parametrize(
    "email",
    [
        "a@b.c",  # menor Email_Valido
        _email_com_tamanho(254),
        "  " + _email_com_tamanho(254).upper() + "  ",  # 254 após normalizar
    ],
    ids=["5-caracteres", "254-caracteres", "254-apos-normalizar"],
)
def test_email_nos_limites_e_aceito(app_isolada, email):
    sessao = _cadastrar(app_isolada, email=email)

    assert sessao["user"]["email"] == email.strip().lower()
    assert len(sessao["user"]["email"]) <= 254


@pytest.mark.parametrize(
    "email",
    ["", "   ", "a@", "a@b", _email_com_tamanho(255), "a@@b.com", "a@b@c.com", "ana.email.com"],
    ids=["vazio", "espacos", "2-caracteres", "3-sem-ponto", "255-caracteres",
         "dois-arrobas-juntos", "dois-arrobas", "sem-arroba"],
)
def test_email_invalido_e_recusado_sem_criar_usuario(app_isolada, email):
    resposta = app_isolada.cliente.post(
        URL_CADASTRO, json={"email": email, "name": "Ana", "password": SENHA}
    )

    assert _campos(resposta) == {"email"}
    assert _contar_usuarios(app_isolada) == 0


# --- 1.3 / 1.4: duplicados ------------------------------------------------------


def test_email_duplicado_responde_409_e_mantem_o_banco(app_isolada):
    _cadastrar(app_isolada, email="ana@email.com")
    antes = _instantaneo(app_isolada)
    app_isolada.relogio.avancar(minutes=1)

    resposta = app_isolada.cliente.post(
        URL_CADASTRO,
        json={"email": " ANA@Email.com ", "name": "Outra Ana", "password": "outra-senha-1"},
    )

    erro = _erro(resposta, 409, "email_em_uso")
    assert erro["message"] == "Já existe uma conta com este e-mail."
    assert "token" not in resposta.json()
    assert _instantaneo(app_isolada) == antes


def test_username_duplicado_sem_diferenciar_caixa_responde_409_e_mantem_o_banco(app_isolada):
    ana = _cadastrar(app_isolada, email="ana@email.com")
    bia = _cadastrar(app_isolada, email="bia@email.com", nome="Bia")
    assert ana["user"]["username"] == "ana"
    antes = _instantaneo(app_isolada)
    app_isolada.relogio.avancar(minutes=1)

    resposta = _editar(app_isolada, bia["token"], nome="Bia Nova", username="AnA",
                       descricao="Oi")

    _erro(resposta, 409, "username_em_uso")
    assert _instantaneo(app_isolada) == antes


# --- 1.5: Hash_Senha no lugar da senha ---------------------------------------


def test_senha_e_guardada_somente_como_hash_argon2id(app_isolada):
    sessao = _cadastrar(app_isolada, email="ana@email.com")

    usuario = _usuario(app_isolada, sessao["user"]["id"])
    assert usuario.hash_senha.startswith("$argon2id$")
    assert usuario.hash_senha != SENHA
    with app_isolada.sessao() as db:
        linhas = db.execute(text("SELECT * FROM usuario")).all()
    assert all(SENHA not in str(valor) for linha in linhas for valor in linha)


# --- 1.6–1.9: limites de nome, username, descrição e foto ---------------------


@pytest.mark.parametrize(
    ("nome", "gravado"),
    [("A", "A"), ("  Ana Silva  ", "Ana Silva"), ("N" * 60, "N" * 60), (" " + "N" * 60 + " ", "N" * 60)],
    ids=["1", "com-espacos", "60", "60-apos-strip"],
)
def test_nome_valido_e_gravado_sem_espacos_nas_pontas(app_isolada, nome, gravado):
    sessao = _cadastrar(app_isolada, nome=nome)
    assert sessao["user"]["name"] == gravado

    app_isolada.relogio.avancar(minutes=1)
    resposta = _editar(app_isolada, sessao["token"], nome=nome)
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["name"] == gravado
    assert _usuario(app_isolada, sessao["user"]["id"]).nome == gravado


@pytest.mark.parametrize("nome", ["", "   ", "N" * 61], ids=["vazio", "espacos", "61"])
def test_nome_invalido_e_recusado(app_isolada, nome):
    resposta = app_isolada.cliente.post(
        URL_CADASTRO, json={"email": "ana@email.com", "name": nome, "password": SENHA}
    )
    assert _campos(resposta) == {"name"}
    assert _contar_usuarios(app_isolada) == 0


@pytest.mark.parametrize(
    "username", ["a", "u" * 30, "Ana.Silva_99", "ANA"], ids=["1", "30", "misto", "maiusculas"]
)
def test_username_valido_e_gravado_com_a_caixa_informada(app_isolada, username):
    sessao = _cadastrar(app_isolada, email="maria@email.com")
    app_isolada.relogio.avancar(minutes=1)

    resposta = _editar(app_isolada, sessao["token"], username=username)

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["username"] == username
    usuario = _usuario(app_isolada, sessao["user"]["id"])
    assert (usuario.username, usuario.username_normalizado) == (username, username.lower())


@pytest.mark.parametrize(
    "username",
    ["", "u" * 31, "ana silva", "ana-silva", "ana@x", "joão", "ana\n"],
    ids=["vazio", "31", "espaco", "hifen", "arroba", "acento", "quebra-de-linha"],
)
def test_username_invalido_e_recusado_sem_alterar_o_usuario(app_isolada, username):
    sessao = _cadastrar(app_isolada)
    antes = _instantaneo(app_isolada)

    resposta = _editar(app_isolada, sessao["token"], username=username)

    assert _campos(resposta) == {"username"}
    assert _instantaneo(app_isolada) == antes


@pytest.mark.parametrize(
    ("descricao", "gravada"),
    [(None, ""), ("", ""), ("D" * 160, "D" * 160)],
    ids=["ausente", "vazia", "160"],
)
def test_descricao_valida(app_isolada, descricao, gravada):
    sessao = _cadastrar(app_isolada)

    resposta = _editar(app_isolada, sessao["token"], descricao=descricao)

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["description"] == gravada
    assert _usuario(app_isolada, sessao["user"]["id"]).descricao == gravada


def test_descricao_com_161_caracteres_e_recusada(app_isolada):
    sessao = _cadastrar(app_isolada)
    antes = _instantaneo(app_isolada)

    resposta = _editar(app_isolada, sessao["token"], descricao="D" * 161)

    assert _campos(resposta) == {"description"}
    assert _instantaneo(app_isolada) == antes


@pytest.mark.parametrize(
    "foto",
    [None, "", foto_data_url(10, "png"), foto_data_url(FOTO_MAX_BYTES, "jpeg")],
    ids=["ausente", "vazia", "pequena", "2MB"],
)
def test_foto_valida(app_isolada, foto):
    sessao = _cadastrar(app_isolada)

    resposta = _editar(app_isolada, sessao["token"], foto=foto)

    esperado = foto or ""
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["photo"] == esperado
    assert _usuario(app_isolada, sessao["user"]["id"]).foto == esperado


@pytest.mark.parametrize(
    "foto",
    [
        foto_data_url(FOTO_MAX_BYTES + 1, "png"),
        "data:text/plain;base64,aGVsbG8=",
        "https://exemplo.com/foto.png",
        "data:image/png;base64,%%%",
    ],
    ids=["2MB-mais-1", "nao-imagem", "url", "base64-malformado"],
)
def test_foto_invalida_e_recusada(app_isolada, foto):
    sessao = _cadastrar(app_isolada)
    antes = _instantaneo(app_isolada)

    resposta = _editar(app_isolada, sessao["token"], foto=foto)

    assert _campos(resposta) == {"photo"}
    assert _instantaneo(app_isolada) == antes


# --- 1.10: flags de administração no cadastro --------------------------------


def test_cadastro_ignora_flags_de_administracao_enviados(app_isolada):
    sessao = _cadastrar(
        app_isolada,
        isCommunityAdmin=True,
        isSystemAdmin=True,
        is_community_admin=True,
        is_system_admin=True,
    )

    assert sessao["user"]["isCommunityAdmin"] is False
    assert sessao["user"]["isSystemAdmin"] is False
    usuario = _usuario(app_isolada, sessao["user"]["id"])
    assert usuario.is_community_admin is False
    assert usuario.is_system_admin is False


# --- 1.11 / 1.12: criado_em e atualizado_em ----------------------------------


def test_criado_em_e_atualizado_em_em_utc(app_isolada):
    criacao = app_isolada.relogio.agora()
    sessao = _cadastrar(app_isolada)

    usuario = _usuario(app_isolada, sessao["user"]["id"])
    assert usuario.criado_em == usuario.atualizado_em == criacao
    assert usuario.criado_em.utcoffset() == timedelta(0)
    esperado = criacao.astimezone(UTC).isoformat().replace("+00:00", "Z")
    assert sessao["user"]["createdAt"] == sessao["user"]["updatedAt"] == esperado

    edicao = app_isolada.relogio.avancar(hours=2, minutes=30)
    resposta = _editar(app_isolada, sessao["token"], nome="Ana Souza")
    assert resposta.status_code == 200, resposta.text

    usuario = _usuario(app_isolada, sessao["user"]["id"])
    assert usuario.criado_em == criacao
    assert usuario.atualizado_em == edicao
    assert usuario.atualizado_em.utcoffset() == timedelta(0)
    perfil = resposta.json()
    assert perfil["createdAt"] == esperado
    assert perfil["updatedAt"] == edicao.isoformat().replace("+00:00", "Z")


# --- 1.13: Perfil_Publico sem hash -------------------------------------------


def test_respostas_usam_perfil_publico_sem_hash(app_isolada):
    sessao = _cadastrar(app_isolada)
    hash_senha = _usuario(app_isolada, sessao["user"]["id"]).hash_senha
    cabecalho = _cabecalho(sessao["token"])

    login = app_isolada.cliente.post(URL_LOGIN, json={"email": "ana@email.com", "password": SENHA})
    assert login.status_code == 200, login.text
    leitura = app_isolada.cliente.get(URL_PERFIL, headers=cabecalho)
    edicao = _editar(app_isolada, sessao["token"], descricao="Oi")
    assert leitura.status_code == edicao.status_code == 200

    perfis = [sessao["user"], login.json()["user"], leitura.json(), edicao.json()]
    for perfil in perfis:
        assert set(perfil) == CHAVES_PERFIL
    for resposta_texto in (str(sessao), login.text, leitura.text, edicao.text):
        assert hash_senha not in resposta_texto
        assert "$argon2" not in resposta_texto
        assert SENHA not in resposta_texto


# --- 1.14: vários campos inválidos de uma vez --------------------------------


def test_cadastro_lista_todos_os_campos_invalidos_e_nao_cria_nada(app_isolada):
    resposta = app_isolada.cliente.post(
        URL_CADASTRO, json={"email": "invalido", "name": "  ", "password": "curta"}
    )

    assert _campos(resposta) == {"name", "email", "password"}
    assert _instantaneo(app_isolada) == {tabela: [] for tabela in TABELAS}


def test_edicao_lista_todos_os_campos_invalidos_e_nao_altera_nada(app_isolada):
    sessao = _cadastrar(app_isolada)
    antes = _instantaneo(app_isolada)
    app_isolada.relogio.avancar(minutes=1)

    resposta = _editar(
        app_isolada,
        sessao["token"],
        nome="",
        username="com espaco",
        descricao="D" * 161,
        foto="data:text/plain;base64,aGVsbG8=",
    )

    assert _campos(resposta) == {"name", "username", "description", "photo"}
    assert _instantaneo(app_isolada) == antes


# --- 1.15: falha de persistência -----------------------------------------------


def _falhar_commit(monkeypatch) -> None:
    """``Session.commit`` grava as alterações na transação (``flush``) e então
    falha com ``OperationalError``, como um disco cheio ou banco bloqueado."""

    def commit_com_falha(self: Session) -> None:
        self.flush()
        raise OperationalError("COMMIT", {}, Exception("database is locked"))

    monkeypatch.setattr(Session, "commit", commit_com_falha)


def test_falha_ao_salvar_edicao_mantem_o_usuario_no_estado_anterior(app_isolada, monkeypatch):
    sessao = _cadastrar(app_isolada)
    antes = _instantaneo(app_isolada)
    app_isolada.relogio.avancar(minutes=1)

    _falhar_commit(monkeypatch)
    resposta = _editar(
        app_isolada,
        sessao["token"],
        nome="Ana Souza",
        username="ana.souza",
        descricao="Nova descrição",
        foto=foto_data_url(16),
    )
    monkeypatch.undo()

    erro = _erro(resposta, 500, "falha_ao_salvar")
    assert erro["message"] == "Não foi possível salvar as alterações. Tente novamente."
    assert _instantaneo(app_isolada) == antes

    # Depois da falha o Usuario continua utilizável com os dados antigos.
    leitura = app_isolada.cliente.get(URL_PERFIL, headers=_cabecalho(sessao["token"]))
    assert leitura.status_code == 200
    assert leitura.json()["name"] == "Ana Silva"
    assert leitura.json()["username"] == "ana"


def test_falha_ao_salvar_cadastro_nao_grava_nada(app_isolada, monkeypatch):
    _falhar_commit(monkeypatch)
    resposta = app_isolada.cliente.post(
        URL_CADASTRO, json={"email": "ana@email.com", "name": "Ana", "password": SENHA}
    )
    monkeypatch.undo()

    _erro(resposta, 500, "falha_ao_salvar")
    assert "token" not in resposta.json()
    assert _instantaneo(app_isolada) == {tabela: [] for tabela in TABELAS}
