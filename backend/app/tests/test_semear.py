"""Testes de exemplo da semeadura do Usuario_Demonstracao.

Requisitos 14.1, 14.2, 14.3, 14.4, 14.5, 14.6 e 13.12.

``main()`` de ``app.autenticacao.semear`` é chamado direto, com ``CHOOSEN_ENV``
e ``CHOOSEN_DATABASE_URL`` apontando para a cópia isolada do banco-modelo. Um
único teste roda ``python -m app.autenticacao.semear`` como subprocesso para
conferir o ponto de entrada do módulo e o código de saída.
"""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.autenticacao import semear
from app.autenticacao.modelo import Sessao, TokenRedefinicao, Usuario
from app.core.config import BACKEND_DIR
from app.core.seguranca import gerar_hash_senha, verificar_senha
from app.tests.conftest import migrar

EMAIL = "victor@email.com"
SENHA = "choosen123"
CRIADO_EM = datetime(2025, 6, 1, 9, 30, tzinfo=UTC)

_COLUNAS = [c.key for c in Usuario.__table__.columns]


def _executar_main(ctx, ambiente: str) -> tuple[int, str, str]:
    saida, erro = io.StringIO(), io.StringIO()
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("CHOOSEN_ENV", ambiente)
        mp.setenv("CHOOSEN_DATABASE_URL", ctx.url)
        with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            codigo = semear.main()
    return codigo, saida.getvalue(), erro.getvalue()


def _retrato(db: Session) -> list[tuple]:
    return [
        tuple(getattr(u, c) for c in _COLUNAS)
        for u in db.scalars(select(Usuario).order_by(Usuario.id))
    ]


def _usuarios_demonstracao(db: Session) -> list[Usuario]:
    return list(
        db.scalars(select(Usuario).where(func.lower(func.trim(Usuario.email)) == EMAIL))
    )


def _victor_alterado(email: str = "Victor@Email.com") -> Usuario:
    """Usuario_Demonstracao 'estragado', gravado direto (sem o serviço)."""
    return Usuario(
        email=email,
        username="vic.antigo",
        username_normalizado="vic.antigo",
        hash_senha=gerar_hash_senha("outra-senha-123"),
        nome="Outro Nome",
        descricao="Descrição mantida",
        foto="",
        is_community_admin=False,
        is_system_admin=False,
        criado_em=CRIADO_EM,
        atualizado_em=CRIADO_EM,
    )


def _login(cliente, senha: str = SENHA):
    return cliente.post("/api/v1/auth/login", json={"email": EMAIL, "password": senha})


def _conferir_demonstracao(u: Usuario) -> None:
    assert u.email == EMAIL
    assert u.nome == semear.NOME_DEMONSTRACAO == "Victor Mendes"
    assert u.username == semear.USERNAME_DEMONSTRACAO == "victor"
    assert u.username_normalizado == "victor"
    assert u.is_community_admin is True
    assert u.is_system_admin is True
    assert verificar_senha(u.hash_senha, SENHA)


# --- Criação (14.1, 14.3, 14.5) ------------------------------------------------


def test_main_em_development_cria_usuario_demonstracao(app_isolada):
    codigo, saida, erro = _executar_main(app_isolada, "development")

    assert codigo == 0
    assert saida.strip() == semear.MSG_CRIADO
    assert "criado" in saida
    assert erro == ""

    with app_isolada.sessao() as db:
        usuarios = list(db.scalars(select(Usuario)))
        assert len(usuarios) == 1
        u = usuarios[0]
        _conferir_demonstracao(u)
        assert u.descricao == ""
        assert u.foto == ""
        # A senha só existe como Hash_Senha (14.1): nenhuma coluna a guarda em claro.
        for coluna in _COLUNAS:
            valor = getattr(u, coluna)
            if isinstance(valor, str):
                assert SENHA not in valor, f"senha em texto puro na coluna {coluna}"
        assert u.hash_senha.startswith("$argon2id$")


# --- Restauração (14.2, 14.3, 14.5) --------------------------------------------


def test_main_em_development_restaura_sem_duplicar_e_mantem_sessoes(app_isolada):
    # Cria pela semeadura e abre uma Sessao com login real.
    assert _executar_main(app_isolada, "development")[0] == 0
    resposta = _login(app_isolada.cliente)
    assert resposta.status_code == 200
    token = resposta.json()["token"]

    # Estraga o Usuario_Demonstracao direto no banco, mantendo id e criado_em.
    with app_isolada.sessao() as db:
        u = _usuarios_demonstracao(db)[0]
        id_original, criado_em_original = u.id, u.criado_em
        u.email = "Victor@Email.com"
        u.nome = "Outro Nome"
        u.username = "vic.antigo"
        u.username_normalizado = "vic.antigo"
        u.is_community_admin = False
        u.is_system_admin = False
        u.hash_senha = gerar_hash_senha("outra-senha-123")
        u.descricao = "Descrição mantida"
        u.foto = "data:image/png;base64,iVBORw0KGgo="
        db.commit()
    # Sessão fechada antes de main().

    codigo, saida, erro = _executar_main(app_isolada, "development")

    assert codigo == 0
    assert saida.strip() == semear.MSG_RESTAURADO
    assert "restaurado" in saida
    assert erro == ""

    with app_isolada.sessao() as db:
        demonstracao = _usuarios_demonstracao(db)
        assert len(demonstracao) == 1, "a restauração duplicou o Usuario"
        assert db.scalar(select(func.count()).select_from(Usuario)) == 1
        u = demonstracao[0]
        _conferir_demonstracao(u)
        assert u.id == id_original
        assert u.criado_em == criado_em_original
        assert u.descricao == "Descrição mantida"
        assert u.foto == "data:image/png;base64,iVBORw0KGgo="
        sessoes = list(db.scalars(select(Sessao).where(Sessao.usuario_id == u.id)))
        assert len(sessoes) == 1 and sessoes[0].revogada_em is None

    # A Sessao aberta antes da restauração continua valendo.
    perfil = app_isolada.cliente.get(
        "/api/v1/usuarios/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert perfil.status_code == 200
    assert perfil.json()["name"] == "Victor Mendes"
    assert perfil.json()["username"] == "victor"


def test_main_restaura_usuario_gravado_com_email_em_outra_caixa(app_isolada):
    with app_isolada.sessao() as db:
        db.add(_victor_alterado("VICTOR@EMAIL.COM"))
        db.commit()

    codigo, saida, erro = _executar_main(app_isolada, "development")

    assert (codigo, saida.strip(), erro) == (0, semear.MSG_RESTAURADO, "")
    with app_isolada.sessao() as db:
        demonstracao = _usuarios_demonstracao(db)
        assert len(demonstracao) == 1
        _conferir_demonstracao(demonstracao[0])


def test_main_executado_duas_vezes_cria_e_depois_restaura(app_isolada):
    primeira = _executar_main(app_isolada, "development")
    segunda = _executar_main(app_isolada, "development")

    assert primeira == (0, semear.MSG_CRIADO + "\n", "")
    assert segunda == (0, semear.MSG_RESTAURADO + "\n", "")
    with app_isolada.sessao() as db:
        assert len(_usuarios_demonstracao(db)) == 1


# --- Recusa fora de development (14.4) -----------------------------------------


@pytest.mark.parametrize("ambiente", ["test", "production"])
def test_main_fora_de_development_recusa_sem_criar(app_isolada, ambiente):
    codigo, saida, erro = _executar_main(app_isolada, ambiente)

    assert codigo != 0
    assert erro.strip() == semear.MSG_AMBIENTE_RECUSADO
    assert "development" in erro
    assert saida == ""
    with app_isolada.sessao() as db:
        assert db.scalar(select(func.count()).select_from(Usuario)) == 0


@pytest.mark.parametrize("ambiente", ["test", "production"])
def test_main_fora_de_development_recusa_sem_restaurar(app_isolada, ambiente):
    with app_isolada.sessao() as db:
        db.add(_victor_alterado())
        db.commit()
        antes = _retrato(db)

    codigo, saida, erro = _executar_main(app_isolada, ambiente)

    assert codigo != 0
    assert erro.strip() == semear.MSG_AMBIENTE_RECUSADO
    assert saida == ""
    with app_isolada.sessao() as db:
        assert _retrato(db) == antes, "a recusa alterou o banco"


def test_main_com_username_victor_de_outra_conta_recusa_sem_alterar(app_isolada):
    with app_isolada.sessao() as db:
        db.add(
            Usuario(
                email="dono@exemplo.com",
                username="Victor",
                username_normalizado="victor",
                hash_senha=gerar_hash_senha("senha-do-dono-1"),
                nome="Dono",
                descricao="",
                foto="",
                is_community_admin=False,
                is_system_admin=False,
                criado_em=CRIADO_EM,
                atualizado_em=CRIADO_EM,
            )
        )
        db.commit()
        antes = _retrato(db)

    codigo, saida, erro = _executar_main(app_isolada, "development")

    assert codigo == 1
    assert erro.strip() == semear.MSG_USERNAME_EM_CONFLITO.format(email="dono@exemplo.com")
    assert saida == ""
    with app_isolada.sessao() as db:
        assert _retrato(db) == antes


# --- Login depois da semeadura (14.6) ------------------------------------------


def test_login_depois_da_semeadura_devolve_usuario_demonstracao(app_isolada):
    assert _executar_main(app_isolada, "development")[0] == 0

    resposta = _login(app_isolada.cliente)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["token"]
    usuario = corpo["user"]
    assert usuario["name"] == "Victor Mendes"
    assert usuario["email"] == EMAIL
    assert usuario["username"] == "victor"
    assert usuario["isCommunityAdmin"] is True
    assert usuario["isSystemAdmin"] is True
    assert "hashSenha" not in usuario and "password" not in usuario

    # Perfil com o token devolvido mostra os mesmos dados (Tela_Perfil, 14.3).
    perfil = app_isolada.cliente.get(
        "/api/v1/usuarios/me", headers={"Authorization": f"Bearer {corpo['token']}"}
    )
    assert perfil.status_code == 200
    assert perfil.json()["name"] == "Victor Mendes"
    assert perfil.json()["email"] == EMAIL


def test_login_depois_da_restauracao_aceita_choosen123_e_recusa_senha_antiga(app_isolada):
    with app_isolada.sessao() as db:
        db.add(_victor_alterado())
        db.commit()

    assert _executar_main(app_isolada, "development")[0] == 0

    assert _login(app_isolada.cliente, "outra-senha-123").status_code == 401
    resposta = _login(app_isolada.cliente)
    assert resposta.status_code == 200
    assert resposta.json()["user"]["name"] == "Victor Mendes"
    assert resposta.json()["user"]["email"] == EMAIL


# --- Ponto de entrada do módulo ------------------------------------------------


def _ambiente_subprocesso(ambiente: str, url: str) -> dict[str, str]:
    env = {
        nome: valor
        for nome, valor in os.environ.items()
        if not nome.upper().startswith("CHOOSEN_")
        and nome.upper() not in ("DATABASE_URL", "CORS_ORIGINS")
    }
    env["CHOOSEN_ENV"] = ambiente
    env["CHOOSEN_DATABASE_URL"] = url
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def test_modulo_semear_como_comando(tmp_path):
    caminho = tmp_path / "semear_cli.db"
    assert caminho.resolve() != (BACKEND_DIR / "choosen.db").resolve()
    url = f"sqlite:///{caminho.resolve().as_posix()}"
    migrar(url)

    resultado = subprocess.run(
        [sys.executable, "-m", "app.autenticacao.semear"],
        cwd=BACKEND_DIR,
        env=_ambiente_subprocesso("development", url),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )

    assert resultado.returncode == 0, resultado.stderr
    assert resultado.stdout.strip() == semear.MSG_CRIADO

    engine = create_engine(url)
    try:
        with Session(engine) as db:
            demonstracao = _usuarios_demonstracao(db)
            assert len(demonstracao) == 1
            _conferir_demonstracao(demonstracao[0])
            assert db.scalar(select(func.count()).select_from(TokenRedefinicao)) == 0
    finally:
        engine.dispose()
