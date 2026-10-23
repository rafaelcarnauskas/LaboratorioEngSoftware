"""Testes de exemplo de login, cadastro e ``email-em-uso`` (Requisito 13.12).

Complementam as propriedades 2, 3, 8, 9 e 16 com casos concretos:

- login com sucesso, e-mail inexistente e senha errada (mesmo corpo 401), e-mail
  inválido e senha vazia (422 sem consultar ``buscar_usuario``) e a verificação
  contra ``HASH_FICTICIO`` quando o e-mail não existe (3.2, 3.3, 3.4, 3.8);
- cadastro 201 com login automático, username derivado e sufixos (``ana``,
  ``ana2``, base truncada, ``usuario``), 409, 422 por campo, nada criado em
  falha (inclusive falha de ``commit``), Usuario e Sessao num único ``commit``
  e ``GET /auth/email-em-uso`` (4.2–4.5, 4.7–4.9, 4.12);
- cadastro concorrente: duas threads, cada uma com o próprio ``TestClient``,
  no mesmo arquivo SQLite → exatamente um 201, um 409 e um Usuario (4.7).
"""

from __future__ import annotations

import threading
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.autenticacao import servico
from app.autenticacao.modelo import Sessao, Usuario
from app.core import seguranca

URL_LOGIN = "/api/v1/auth/login"
URL_CADASTRO = "/api/v1/auth/cadastro"
URL_EMAIL_EM_USO = "/api/v1/auth/email-em-uso"
URL_PERFIL = "/api/v1/usuarios/me"

SENHA = "senha-segura-123"
CHAVES_PERFIL = {
    "id", "name", "username", "email", "description", "photo",
    "isCommunityAdmin", "isSystemAdmin", "createdAt", "updatedAt",
}


# --- Apoio -------------------------------------------------------------------


def _cadastrar(cliente, email: str, nome: str = "Ana", senha: str = SENHA):
    return cliente.post(URL_CADASTRO, json={"name": nome, "email": email, "password": senha})


def _contagens(app_isolada) -> tuple[int, int]:
    """(Usuarios, Sessoes) persistidos, lidos numa sessão própria já fechada."""
    with app_isolada.sessao() as db:
        usuarios = db.scalar(select(func.count()).select_from(Usuario))
        sessoes = db.scalar(select(func.count()).select_from(Sessao))
    return usuarios, sessoes


def _username(app_isolada, email: str) -> str:
    with app_isolada.sessao() as db:
        return db.scalars(select(Usuario.username).where(Usuario.email == email)).one()


def _instante_utc(app_isolada, minutos: int = 0) -> str:
    instante = app_isolada.relogio.agora() + timedelta(minutes=minutos)
    return instante.isoformat().replace("+00:00", "Z")


@pytest.fixture
def espiao_busca(monkeypatch):
    """Registra as chamadas a ``servico.buscar_usuario`` (o que o login usa)."""
    chamadas: list[str] = []
    original = servico.buscar_usuario

    def espiao(db, email):
        chamadas.append(email)
        return original(db, email)

    monkeypatch.setattr(servico, "buscar_usuario", espiao)
    return chamadas


@pytest.fixture
def espiao_verificacao(monkeypatch):
    """Registra os hashes passados a ``verificar_senha`` pelo Servico_Autenticacao."""
    hashes: list[str] = []
    original = servico.verificar_senha

    def espiao(hash_senha, senha):
        hashes.append(hash_senha)
        return original(hash_senha, senha)

    monkeypatch.setattr(servico, "verificar_senha", espiao)
    return hashes


def _falhar_commit(monkeypatch) -> list[int]:
    """Faz todo ``Session.commit`` lançar ``OperationalError``; devolve o contador."""
    tentativas: list[int] = []

    def commit_quebrado(self):
        tentativas.append(1)
        raise OperationalError("COMMIT", {}, Exception("disco cheio"))

    monkeypatch.setattr(Session, "commit", commit_quebrado)
    return tentativas


# --- Login -------------------------------------------------------------------


def test_login_com_sucesso_devolve_token_expiracao_e_perfil(app_isolada, cliente, relogio):
    """3.2, 3.3: e-mail com outra caixa e espaços entra; resposta sem segredos."""
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    relogio.avancar(minutes=10)
    antes = _contagens(app_isolada)

    resposta = cliente.post(URL_LOGIN, json={"email": "  ANA@Email.COM ", "password": SENHA})

    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert set(corpo) == {"token", "expiresAt", "user"}
    assert len(corpo["token"]) >= 43
    ttl = app_isolada.config.session_ttl_minutes
    assert corpo["expiresAt"] == _instante_utc(app_isolada, ttl)
    assert set(corpo["user"]) == CHAVES_PERFIL
    assert corpo["user"]["email"] == "ana@email.com"
    assert SENHA not in resposta.text
    assert "argon2" not in resposta.text
    assert _contagens(app_isolada) == (antes[0], antes[1] + 1)

    with app_isolada.sessao() as db:
        nova = db.scalars(
            select(Sessao).where(Sessao.token_hash == seguranca.hash_token(corpo["token"]))
        ).one()
        assert nova.usuario_id == corpo["user"]["id"]
        assert nova.revogada_em is None

    perfil = cliente.get(URL_PERFIL, headers={"Authorization": f"Bearer {corpo['token']}"})
    assert perfil.status_code == 200
    assert perfil.json() == corpo["user"]


def test_login_email_inexistente_e_senha_errada_tem_o_mesmo_corpo_401(app_isolada, cliente):
    """3.4: mesmo status e corpo idêntico byte a byte; nenhuma Sessao criada."""
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    antes = _contagens(app_isolada)

    inexistente = cliente.post(URL_LOGIN, json={"email": "bia@email.com", "password": SENHA})
    senha_errada = cliente.post(
        URL_LOGIN, json={"email": "ana@email.com", "password": "outra-senha-123"}
    )

    assert inexistente.status_code == senha_errada.status_code == 401
    assert inexistente.content == senha_errada.content
    assert inexistente.json() == {
        "error": {"code": "credenciais_invalidas", "message": "E-mail ou senha incorretos."}
    }
    assert _contagens(app_isolada) == antes


def test_login_email_inexistente_verifica_senha_contra_hash_ficticio(
    cliente, espiao_busca, espiao_verificacao
):
    """3.4: e-mail desconhecido ainda paga uma verificação Argon2 (tempo constante)."""
    resposta = cliente.post(URL_LOGIN, json={"email": "Ninguem@Email.com", "password": SENHA})

    assert resposta.status_code == 401
    assert espiao_busca == ["ninguem@email.com"]  # 3.2: busca pelo Email_Normalizado
    assert espiao_verificacao == [seguranca.HASH_FICTICIO]


def test_login_senha_errada_verifica_contra_o_hash_do_usuario(
    app_isolada, cliente, espiao_verificacao
):
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    with app_isolada.sessao() as db:
        hash_ana = db.scalars(select(Usuario.hash_senha)).one()

    resposta = cliente.post(URL_LOGIN, json={"email": "ana@email.com", "password": "errada-123"})

    assert resposta.status_code == 401
    assert espiao_verificacao == [hash_ana]
    assert hash_ana != seguranca.HASH_FICTICIO


@pytest.mark.parametrize(
    "email", ["", "   ", "ana", "ana@email", "ana@@email.com", "a b@email.com", "@email.com"]
)
def test_login_email_invalido_responde_422_sem_consultar(
    app_isolada, cliente, espiao_busca, email
):
    """3.8: 422 antes de qualquer consulta ao Servico_Usuario, sem Sessao."""
    antes = _contagens(app_isolada)

    resposta = cliente.post(URL_LOGIN, json={"email": email, "password": SENHA})

    assert resposta.status_code == 422, resposta.text
    erro = resposta.json()["error"]
    assert erro["code"] == "validacao"
    assert [campo["field"] for campo in erro["fields"]] == ["email"]
    assert espiao_busca == []
    assert _contagens(app_isolada) == antes


def test_login_senha_vazia_responde_422_sem_consultar(app_isolada, cliente, espiao_busca):
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    antes = _contagens(app_isolada)
    espiao_busca.clear()  # o cadastro de preparo também consulta buscar_usuario

    resposta = cliente.post(URL_LOGIN, json={"email": "ana@email.com", "password": ""})

    assert resposta.status_code == 422
    assert [c["field"] for c in resposta.json()["error"]["fields"]] == ["password"]
    assert espiao_busca == []
    assert _contagens(app_isolada) == antes


def test_login_falha_de_persistencia_da_sessao_responde_500_sem_token(
    app_isolada, cliente, monkeypatch
):
    """2.9: o commit da Sessao falha → 500 ``sessao_nao_criada`` sem token."""
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    antes = _contagens(app_isolada)
    _falhar_commit(monkeypatch)

    resposta = cliente.post(URL_LOGIN, json={"email": "ana@email.com", "password": SENHA})

    monkeypatch.undo()
    assert resposta.status_code == 500
    assert resposta.json()["error"]["code"] == "sessao_nao_criada"
    assert "token" not in resposta.json()
    assert _contagens(app_isolada) == antes


# --- Cadastro ----------------------------------------------------------------


def test_cadastro_201_cria_usuario_e_sessao_com_login_automatico(app_isolada, cliente):
    """4.2, 4.5: nome sem espaços, Email_Normalizado, Hash_Senha e Sessao válida."""
    resposta = _cadastrar(cliente, "  Ana.Souza@Email.COM ", nome="  Ana Souza  ")

    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert set(corpo) == {"token", "expiresAt", "user"}
    usuario = corpo["user"]
    assert usuario["name"] == "Ana Souza"
    assert usuario["email"] == "ana.souza@email.com"
    assert usuario["username"] == "ana.souza"
    assert usuario["description"] == usuario["photo"] == ""
    assert usuario["isCommunityAdmin"] is False and usuario["isSystemAdmin"] is False
    assert usuario["createdAt"] == usuario["updatedAt"] == _instante_utc(app_isolada)
    ttl = app_isolada.config.session_ttl_minutes
    assert corpo["expiresAt"] == _instante_utc(app_isolada, ttl)
    assert SENHA not in resposta.text
    assert _contagens(app_isolada) == (1, 1)

    with app_isolada.sessao() as db:
        gravado = db.get(Usuario, usuario["id"])
        assert gravado.hash_senha != SENHA
        assert seguranca.verificar_senha(gravado.hash_senha, SENHA)
        sessao = db.scalars(select(Sessao)).one()
        assert sessao.usuario_id == usuario["id"]
        assert sessao.token_hash == seguranca.hash_token(corpo["token"])

    perfil = cliente.get(URL_PERFIL, headers={"Authorization": f"Bearer {corpo['token']}"})
    assert perfil.status_code == 200
    assert perfil.json() == usuario

    login = cliente.post(URL_LOGIN, json={"email": "ana.souza@email.com", "password": SENHA})
    assert login.status_code == 200


def test_cadastro_grava_usuario_e_sessao_num_unico_commit(app_isolada, cliente, monkeypatch):
    """4.9: um só ``commit`` leva o Usuario e a Sessao."""
    commits: list[int] = []
    original = Session.commit

    def contar(self):
        commits.append(1)
        return original(self)

    monkeypatch.setattr(Session, "commit", contar)
    resposta = _cadastrar(cliente, "ana@email.com")
    monkeypatch.undo()

    assert resposta.status_code == 201
    assert len(commits) == 1
    assert _contagens(app_isolada) == (1, 1)


@pytest.mark.parametrize(
    ("emails", "esperados"),
    [
        # Base livre e sufixos a partir de 2, de 1 em 1.
        (["ana@email.com", "ana@outro.com", "ana@mais.com"], ["ana", "ana2", "ana3"]),
        # Caracteres fora de [A-Za-z0-9._] são removidos.
        (["ana.maria+tag@email.com"], ["ana.mariatag"]),
        # Parte local sem nenhum caractere permitido → "usuario".
        (["+++@email.com", "---@outro.com"], ["usuario", "usuario2"]),
        # Base truncada em 30 e encurtada para caber o sufixo.
        (
            ["abcdefghij" * 4 + "@email.com", "abcdefghij" * 4 + "@outro.com"],
            [("abcdefghij" * 3), ("abcdefghij" * 3)[:29] + "2"],
        ),
    ],
)
def test_cadastro_deriva_username_e_acrescenta_sufixos(app_isolada, cliente, emails, esperados):
    """4.3, 4.4."""
    for email, esperado in zip(emails, esperados, strict=True):
        resposta = _cadastrar(cliente, email)
        assert resposta.status_code == 201, resposta.text
        assert resposta.json()["user"]["username"] == esperado
        assert len(esperado) <= 30
        assert _username(app_isolada, email) == esperado


def test_cadastro_sufixo_considera_username_ocupado_com_outra_caixa(app_isolada, cliente):
    """4.4: ``ANA`` já existente bloqueia ``ana`` (comparação sem caixa)."""
    assert _cadastrar(cliente, "primeira@email.com").status_code == 201
    with app_isolada.sessao() as db:
        usuario = db.scalars(select(Usuario)).one()
        usuario.username = "ANA"
        usuario.username_normalizado = "ana"
        db.commit()

    resposta = _cadastrar(cliente, "ana@email.com")

    assert resposta.status_code == 201
    assert resposta.json()["user"]["username"] == "ana2"


def test_cadastro_email_em_uso_responde_409_sem_criar_nada(app_isolada, cliente):
    """4.7, 4.9: mesmo Email_Normalizado (outra caixa e espaços) → 409."""
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    antes = _contagens(app_isolada)

    resposta = _cadastrar(cliente, "  ANA@email.com  ", nome="Outra Ana")

    assert resposta.status_code == 409
    assert resposta.json() == {
        "error": {"code": "email_em_uso", "message": "Já existe uma conta com este e-mail."}
    }
    assert _contagens(app_isolada) == antes


@pytest.mark.parametrize(
    ("corpo", "campos"),
    [
        ({"name": "   ", "email": "ana@email.com", "password": SENHA}, {"name"}),
        ({"name": "A" * 61, "email": "ana@email.com", "password": SENHA}, {"name"}),
        ({"name": "Ana", "email": "ana@email", "password": SENHA}, {"email"}),
        ({"name": "Ana", "email": "ana@email.com", "password": "1234567"}, {"password"}),
        ({"name": "Ana", "email": "ana@email.com", "password": "x" * 129}, {"password"}),
        ({"name": "", "email": "sem-arroba", "password": ""}, {"name", "email", "password"}),
    ],
)
def test_cadastro_invalido_responde_422_por_campo_sem_criar_nada(
    app_isolada, cliente, corpo, campos
):
    """4.8, 4.9: cada campo inválido aparece em ``fields``; nada é gravado."""
    resposta = cliente.post(URL_CADASTRO, json=corpo)

    assert resposta.status_code == 422, resposta.text
    erro = resposta.json()["error"]
    assert erro["code"] == "validacao"
    assert {campo["field"] for campo in erro["fields"]} == campos
    assert all(campo["message"] for campo in erro["fields"])
    assert "token" not in resposta.json()
    assert _contagens(app_isolada) == (0, 0)


def test_cadastro_limites_validos_sao_aceitos(cliente):
    """4.2: nome com 60 caracteres e senhas com 8 e 128 caracteres."""
    assert _cadastrar(cliente, "a@email.com", nome="N" * 60, senha="x" * 8).status_code == 201
    assert _cadastrar(cliente, "b@email.com", nome="N", senha="x" * 128).status_code == 201


def test_cadastro_falha_no_commit_responde_500_sem_criar_nada(
    app_isolada, cliente, monkeypatch
):
    """4.9, 1.15: commit quebrado → 500 ``falha_ao_salvar``, sem token, banco intacto."""
    tentativas = _falhar_commit(monkeypatch)

    resposta = _cadastrar(cliente, "ana@email.com")

    monkeypatch.undo()
    assert tentativas, "o commit deveria ter sido tentado"
    assert resposta.status_code == 500
    assert resposta.json()["error"]["code"] == "falha_ao_salvar"
    assert "token" not in resposta.json()
    assert _contagens(app_isolada) == (0, 0)

    # Depois da falha, o mesmo cadastro funciona normalmente.
    assert _cadastrar(cliente, "ana@email.com").status_code == 201
    assert _contagens(app_isolada) == (1, 1)


def test_cadastro_concorrente_mesmo_email_um_201_um_409_e_um_usuario(
    app_isolada, monkeypatch
):
    """4.7: duas threads, cada uma com o próprio ``TestClient``, no mesmo SQLite.

    Uma barreira depois da checagem prévia do e-mail faz as duas requisições
    passarem por ela antes de qualquer gravação, forçando a corrida até a
    constraint única do banco.
    """
    barreira = threading.Barrier(2, timeout=5)
    original = servico.buscar_usuario

    def busca_sincronizada(db, email):
        resultado = original(db, email)
        try:
            barreira.wait()
        except threading.BrokenBarrierError:
            pass
        return resultado

    monkeypatch.setattr(servico, "buscar_usuario", busca_sincronizada)
    clientes = [app_isolada.novo_cliente(), app_isolada.novo_cliente()]
    status: list[int] = []
    erros: list[BaseException] = []
    trava = threading.Lock()

    def cadastrar(cliente, nome):
        try:
            resposta = _cadastrar(cliente, "corrida@email.com", nome=nome)
            with trava:
                status.append(resposta.status_code)
        except BaseException as erro:  # noqa: BLE001 - repassado ao assert abaixo
            with trava:
                erros.append(erro)

    threads = [
        threading.Thread(target=cadastrar, args=(c, f"Pessoa {i}"))
        for i, c in enumerate(clientes)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    monkeypatch.undo()

    assert not erros, erros
    assert not any(thread.is_alive() for thread in threads)
    assert sorted(status) == [201, 409]
    with app_isolada.sessao() as db:
        usuarios = db.scalars(select(Usuario).where(Usuario.email == "corrida@email.com")).all()
        assert len(usuarios) == 1
        sessoes = db.scalars(select(Sessao)).all()
        assert [s.usuario_id for s in sessoes] == [usuarios[0].id]


# --- email-em-uso ------------------------------------------------------------


def test_email_em_uso(cliente):
    """4.12: verdadeiro só para o Email_Normalizado de um Usuario existente."""
    assert _cadastrar(cliente, "ana@email.com").status_code == 201

    def em_uso(**params):
        resposta = cliente.get(URL_EMAIL_EM_USO, params=params)
        assert resposta.status_code == 200
        assert set(resposta.json()) == {"inUse"}
        return resposta.json()["inUse"]

    assert em_uso(email="ana@email.com") is True
    assert em_uso(email="  ANA@Email.com ") is True
    assert em_uso(email="bia@email.com") is False
    assert em_uso(email="ana") is False
    assert em_uso(email="") is False
    assert em_uso() is False
