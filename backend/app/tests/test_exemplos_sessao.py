"""Testes de exemplo da entidade Sessao (Requisitos 2.1 a 2.9, 13.12).

Casos concretos que complementam as propriedades 10, 12, 13 e 14: estrutura e
UTC das colunas, várias Sessoes por Usuario, formato e unicidade do token,
colisão forçada de ``token_hash``, só o hash persistido, TTL padrão e
configurado, expiração estrita, revogação idempotente, TTL inválido na
inicialização e falha de persistência da Sessao.

Cada teste usa uma cópia própria do banco-modelo (fixtures do ``conftest``).
As ``Session`` abertas pelo teste são fechadas antes de chamar a API.
"""

from __future__ import annotations

import base64
import itertools
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.autenticacao.modelo import Sessao, Usuario
from app.autenticacao.servico import (
    ErroDominio,
    criar_sessao,
    criar_usuario,
    revogar_sessao,
    validar_sessao,
)
from app.core import seguranca

LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
PERFIL = "/api/v1/usuarios/me"

EMAIL = "ana@exemplo.com"
SENHA = "senha-segura-1"
TTL_PADRAO = 10080


# --- Auxiliares ----------------------------------------------------------------


def _criar_usuario(ctx, agora: datetime | None = None) -> str:
    """Cria o Usuario de teste direto no serviço e devolve o ``id``."""
    with ctx.sessao() as db:
        usuario = criar_usuario(db, "Ana", EMAIL, SENHA, agora or ctx.relogio.agora())
        return usuario.id


def _login(cliente) -> dict:
    resposta = cliente.post(LOGIN, json={"email": EMAIL, "password": SENHA})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _instante(texto: str) -> datetime:
    return datetime.fromisoformat(texto.replace("Z", "+00:00"))


def _sessoes(ctx) -> list[Sessao]:
    with ctx.sessao() as db:
        sessoes = list(db.scalars(select(Sessao).order_by(Sessao.criada_em, Sessao.id)))
        for sessao in sessoes:
            db.expunge(sessao)
        return sessoes


def _contar_sessoes(ctx) -> int:
    with ctx.sessao() as db:
        return db.scalar(select(func.count()).select_from(Sessao))


# --- 2.1 Estrutura e UTC -------------------------------------------------------


def test_tabela_sessao_tem_exatamente_os_campos_do_requisito(app_isolada):
    inspetor = inspect(app_isolada.engine)
    colunas = {coluna["name"]: coluna for coluna in inspetor.get_columns("sessao")}
    assert set(colunas) == {
        "id", "usuario_id", "token_hash", "criada_em", "expira_em", "revogada_em",
    }
    assert colunas["revogada_em"]["nullable"] is True
    for obrigatoria in ("id", "usuario_id", "token_hash", "criada_em", "expira_em"):
        assert colunas[obrigatoria]["nullable"] is False

    chaves = inspetor.get_foreign_keys("sessao")
    assert any(
        fk["referred_table"] == "usuario" and fk["constrained_columns"] == ["usuario_id"]
        for fk in chaves
    )


def test_instantes_gravados_em_utc_e_revogada_em_vazio_ate_revogar(app_isolada):
    # Instante em UTC-3: 09:00 local == 12:00 UTC.
    fuso_brasilia = timezone(timedelta(hours=-3))
    agora_local = datetime(2026, 1, 15, 9, 0, 0, tzinfo=fuso_brasilia)
    _criar_usuario(app_isolada, agora_local)

    with app_isolada.sessao() as db:
        usuario_id = db.scalar(text("SELECT id FROM usuario"))
        usuario = db.get(Usuario, usuario_id)
        sessao, _token = criar_sessao(db, usuario, agora_local, 60)
        sessao_id = sessao.id

    with app_isolada.sessao() as db:
        bruto = db.execute(
            text("SELECT criada_em, expira_em, revogada_em FROM sessao WHERE id = :id"),
            {"id": sessao_id},
        ).one()
        # O SQLite guarda o instante em UTC, sem fuso.
        assert datetime.fromisoformat(str(bruto.criada_em)) == datetime(2026, 1, 15, 12, 0, 0)
        assert datetime.fromisoformat(str(bruto.expira_em)) == datetime(2026, 1, 15, 13, 0, 0)
        assert bruto.revogada_em is None

        relida = db.get(Sessao, sessao_id)
        assert relida.criada_em.tzinfo is not None
        assert relida.criada_em.utcoffset() == timedelta(0)
        assert relida.criada_em == datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC)
        assert relida.revogada_em is None

        revogar_sessao(db, relida, datetime(2026, 1, 15, 9, 30, 0, tzinfo=fuso_brasilia))

    with app_isolada.sessao() as db:
        bruto = db.scalar(
            text("SELECT revogada_em FROM sessao WHERE id = :id"), {"id": sessao_id}
        )
        assert datetime.fromisoformat(str(bruto)) == datetime(2026, 1, 15, 12, 30, 0)
        assert db.get(Sessao, sessao_id).revogada_em == datetime(
            2026, 1, 15, 12, 30, 0, tzinfo=UTC
        )


# --- 2.2 Várias Sessoes por Usuario --------------------------------------------


def test_sessao_exige_usuario_existente(app_isolada):
    agora = app_isolada.relogio.agora()
    with app_isolada.sessao() as db:
        db.add(
            Sessao(
                usuario_id="00000000-0000-4000-8000-000000000000",
                token_hash=seguranca.hash_token("qualquer"),
                criada_em=agora,
                expira_em=agora + timedelta(minutes=5),
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    assert _contar_sessoes(app_isolada) == 0


def test_varios_logins_criam_sessoes_independentes_do_mesmo_usuario(app_isolada):
    usuario_id = _criar_usuario(app_isolada)
    cliente, relogio = app_isolada.cliente, app_isolada.relogio

    primeira = _login(cliente)
    antes = _sessoes(app_isolada)
    assert len(antes) == 1

    relogio.avancar(minutes=1)
    segunda = _login(cliente)
    relogio.avancar(minutes=1)
    terceira = _login(cliente)

    tokens = [primeira["token"], segunda["token"], terceira["token"]]
    assert len(set(tokens)) == 3

    depois = _sessoes(app_isolada)
    assert len(depois) == 3
    assert {s.usuario_id for s in depois} == {usuario_id}
    assert len({s.token_hash for s in depois}) == 3

    # A primeira Sessao não foi alterada pelas criações seguintes.
    original = next(s for s in depois if s.id == antes[0].id)
    assert original.token_hash == antes[0].token_hash
    assert original.criada_em == antes[0].criada_em
    assert original.expira_em == antes[0].expira_em
    assert original.revogada_em is None

    # As três continuam válidas ao mesmo tempo.
    for token in tokens:
        assert cliente.get(PERFIL, headers=_bearer(token)).status_code == 200


# --- 2.3 Token e unicidade do hash ---------------------------------------------


def test_token_tem_256_bits_e_pelo_menos_43_caracteres(app_isolada):
    _criar_usuario(app_isolada)
    token = _login(app_isolada.cliente)["token"]
    assert len(token) >= 43
    # token_urlsafe(32): 32 bytes aleatórios em base64 URL-safe sem padding.
    assert len(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))) >= 32


def test_mil_tokens_gerados_sao_distintos():
    tokens = [seguranca.gerar_token() for _ in range(1000)]
    assert all(len(token) >= 43 for token in tokens)
    assert len(set(tokens)) == 1000
    assert len({seguranca.hash_token(token) for token in tokens}) == 1000


def test_colisao_de_token_hash_tenta_de_novo_com_outro_token(app_isolada, monkeypatch):
    _criar_usuario(app_isolada)
    cliente = app_isolada.cliente
    existente = _login(cliente)["token"]
    original = _sessoes(app_isolada)[0]

    novo = "token-novo-" + "x" * 40
    sequencia = iter([existente, novo])
    monkeypatch.setattr("app.core.seguranca.gerar_token", lambda: next(sequencia))

    resposta = _login(cliente)
    assert resposta["token"] == novo

    sessoes = _sessoes(app_isolada)
    assert len(sessoes) == 2
    assert {s.token_hash for s in sessoes} == {
        seguranca.hash_token(existente),
        seguranca.hash_token(novo),
    }
    # A Sessao que já existia não foi tocada pela colisão.
    mantida = next(s for s in sessoes if s.id == original.id)
    assert mantida.token_hash == original.token_hash
    assert mantida.revogada_em is None


def test_colisao_persistente_devolve_500_sem_token_e_sem_sessao_nova(app_isolada, monkeypatch):
    _criar_usuario(app_isolada)
    cliente = app_isolada.cliente
    existente = _login(cliente)["token"]

    chamadas = itertools.count(1)

    def sempre_o_mesmo() -> str:
        next(chamadas)
        return existente

    monkeypatch.setattr("app.core.seguranca.gerar_token", sempre_o_mesmo)

    resposta = cliente.post(LOGIN, json={"email": EMAIL, "password": SENHA})
    assert resposta.status_code == 500
    corpo = resposta.json()
    assert corpo["error"]["code"] == "sessao_nao_criada"
    assert "token" not in corpo
    assert existente not in resposta.text
    assert next(chamadas) > 2  # tentou mais de uma vez
    assert _contar_sessoes(app_isolada) == 1


# --- 2.4 Só o hash é persistido ------------------------------------------------


def test_somente_o_hash_do_token_e_persistido(app_isolada):
    _criar_usuario(app_isolada)
    token = _login(app_isolada.cliente)["token"]

    with app_isolada.sessao() as db:
        linhas = db.execute(text("SELECT * FROM sessao")).mappings().all()
    assert len(linhas) == 1
    linha = linhas[0]
    assert linha["token_hash"] == seguranca.hash_token(token)
    assert len(linha["token_hash"]) == 64
    for coluna, valor in linha.items():
        assert token not in str(valor), f"token em texto claro na coluna {coluna}"

    app_isolada.engine.dispose()
    assert token.encode() not in app_isolada.caminho_db.read_bytes()


def test_token_so_aparece_na_resposta_que_criou_a_sessao(app_isolada):
    _criar_usuario(app_isolada)
    cliente = app_isolada.cliente
    token = _login(cliente)["token"]

    perfil = cliente.get(PERFIL, headers=_bearer(token))
    assert perfil.status_code == 200
    assert token not in perfil.text

    outro_login = _login(cliente)
    assert outro_login["token"] != token
    assert token not in str(outro_login)


# --- 2.5 TTL padrão e configurado ----------------------------------------------


def test_ttl_padrao_e_10080_minutos(app_isolada):
    assert app_isolada.config.session_ttl_minutes == TTL_PADRAO
    _criar_usuario(app_isolada)
    agora = app_isolada.relogio.agora()

    resposta = _login(app_isolada.cliente)
    assert _instante(resposta["expiresAt"]) == agora + timedelta(minutes=TTL_PADRAO)

    sessao = _sessoes(app_isolada)[0]
    assert sessao.criada_em == agora
    assert sessao.expira_em - sessao.criada_em == timedelta(days=7)


@pytest.mark.parametrize("ttl", [1, 5, 525600])
def test_ttl_configurado_pela_variavel_de_ambiente(criar_app_isolada, ttl):
    with criar_app_isolada(ambiente={"CHOOSEN_SESSION_TTL_MINUTES": str(ttl)}) as ctx:
        assert ctx.config.session_ttl_minutes == ttl
        _criar_usuario(ctx)
        agora = ctx.relogio.agora()

        resposta = _login(ctx.cliente)
        assert _instante(resposta["expiresAt"]) == agora + timedelta(minutes=ttl)
        sessao = _sessoes(ctx)[0]
        assert sessao.expira_em - sessao.criada_em == timedelta(minutes=ttl)


# --- 2.6 Expiração estrita -----------------------------------------------------


def test_sessao_expira_exatamente_em_expira_em(criar_app_isolada):
    with criar_app_isolada(ambiente={"CHOOSEN_SESSION_TTL_MINUTES": "5"}) as ctx:
        _criar_usuario(ctx)
        cliente, relogio = ctx.cliente, ctx.relogio
        token = _login(cliente)["token"]
        expira_em = relogio.agora() + timedelta(minutes=5)

        relogio.definir(expira_em - timedelta(microseconds=1))
        assert cliente.get(PERFIL, headers=_bearer(token)).status_code == 200

        relogio.definir(expira_em)
        no_limite = cliente.get(PERFIL, headers=_bearer(token))
        assert no_limite.status_code == 401
        assert no_limite.json()["error"]["code"] == "sessao_invalida"

        relogio.definir(expira_em + timedelta(seconds=1))
        assert cliente.get(PERFIL, headers=_bearer(token)).status_code == 401

        with ctx.sessao() as db:
            assert validar_sessao(db, token, expira_em - timedelta(microseconds=1)) is not None
            assert validar_sessao(db, token, expira_em) is None
            assert validar_sessao(db, token + "x", expira_em - timedelta(minutes=1)) is None
            assert validar_sessao(db, "", expira_em - timedelta(minutes=1)) is None


# --- 2.7 Revogação idempotente -------------------------------------------------


def test_revogacao_grava_o_instante_e_e_idempotente(app_isolada):
    _criar_usuario(app_isolada)
    relogio = app_isolada.relogio
    token = _login(app_isolada.cliente)["token"]
    t1 = relogio.avancar(minutes=10)

    with app_isolada.sessao() as db:
        sessao = validar_sessao(db, token, t1)
        assert sessao is not None
        revogar_sessao(db, sessao, t1)
        assert validar_sessao(db, token, t1) is None

        # Segunda revogação, mais tarde, não muda o instante original.
        revogar_sessao(db, sessao, t1 + timedelta(hours=1))

    with app_isolada.sessao() as db:
        relida = db.scalars(select(Sessao)).one()
        assert relida.revogada_em == t1
        # Cópia nova (já revogada) também não sobrescreve.
        revogar_sessao(db, relida, t1 + timedelta(days=1))

    assert _sessoes(app_isolada)[0].revogada_em == t1
    resposta = app_isolada.cliente.get(PERFIL, headers=_bearer(token))
    assert resposta.status_code == 401


def test_logout_repetido_mantem_revogada_em_original(app_isolada):
    _criar_usuario(app_isolada)
    cliente, relogio = app_isolada.cliente, app_isolada.relogio
    token = _login(cliente)["token"]

    t1 = relogio.avancar(minutes=3)
    assert cliente.post(LOGOUT, headers=_bearer(token)).status_code == 204
    relogio.avancar(minutes=3)
    assert cliente.post(LOGOUT, headers=_bearer(token)).status_code == 401

    assert _sessoes(app_isolada)[0].revogada_em == t1


# --- 2.8 TTL inválido encerra a inicialização ----------------------------------


@pytest.mark.parametrize("valor", ["0", "525601", "-5", "abc", "10.5", ""])
def test_ttl_invalido_recusa_a_inicializacao(criar_app_isolada, valor):
    with pytest.raises(SystemExit) as erro:
        criar_app_isolada(ambiente={"CHOOSEN_SESSION_TTL_MINUTES": valor})
    assert "CHOOSEN_SESSION_TTL_MINUTES" in str(erro.value.code)


# --- 2.9 Falha ao persistir a Sessao -------------------------------------------


def _commit_falho(self):
    raise OperationalError("COMMIT", {}, Exception("disk I/O error"))


def test_falha_no_commit_da_sessao_devolve_500_sem_token_e_sem_linha(app_isolada, monkeypatch):
    _criar_usuario(app_isolada)
    cliente = app_isolada.cliente

    with monkeypatch.context() as mp:
        mp.setattr(Session, "commit", _commit_falho)
        resposta = cliente.post(LOGIN, json={"email": EMAIL, "password": SENHA})

    assert resposta.status_code == 500
    corpo = resposta.json()
    assert corpo["error"]["code"] == "sessao_nao_criada"
    assert set(corpo) == {"error"}
    assert "token" not in resposta.text.lower()
    assert _contar_sessoes(app_isolada) == 0

    # Depois da falha o login volta a funcionar normalmente.
    assert _login(cliente)["token"]
    assert _contar_sessoes(app_isolada) == 1


def test_falha_no_commit_em_criar_sessao_nao_deixa_linha_parcial(app_isolada, monkeypatch):
    usuario_id = _criar_usuario(app_isolada)
    agora = app_isolada.relogio.agora()

    with app_isolada.sessao() as db:
        usuario = db.get(Usuario, usuario_id)
        with monkeypatch.context() as mp:
            mp.setattr(Session, "commit", _commit_falho)
            with pytest.raises(ErroDominio) as erro:
                criar_sessao(db, usuario, agora, TTL_PADRAO)
        assert erro.value.status == 500
        assert erro.value.code == "sessao_nao_criada"
        assert not db.new  # nada pendente na Session

    assert _contar_sessoes(app_isolada) == 0
