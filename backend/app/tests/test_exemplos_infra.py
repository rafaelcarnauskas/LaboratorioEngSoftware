"""Testes de exemplo de configuração e infraestrutura (Requisitos 13.1 a 13.10, 13.12).

Complementam a Property 15 (``test_prop_15_configuracao.py``) com casos
concretos: leitura das variáveis e padrões, ``CHOOSEN_ENV`` e TTL inválidos,
CORS padrão e configurado, ``GET /api/v1/health``, esquema só por Alembic,
``requirements.txt`` fixado e hasher de produção.

Desvios de integração aprovados pelo usuário, testados como comportamento real:

- ``DATABASE_URL`` e ``CORS_ORIGINS`` (sem prefixo, nomes do Render) são aceitos
  quando ``CHOOSEN_DATABASE_URL`` / ``CHOOSEN_CORS_ORIGINS`` não estão definidas;
  as ``CHOOSEN_*`` têm prioridade. ``postgres://`` e ``postgresql://`` viram
  ``postgresql+psycopg://``.
- O CORS também libera o cabeçalho ``X-Usuario`` (usado pelo ``historico``).
- A rota antiga ``GET /health`` continua junto de ``GET /api/v1/health``.
- ``requirements.txt`` traz os 10 pacotes do design mais ``psycopg[binary]`` e
  ``tzdata``; o teste exige que toda linha use ``==`` e que os 10 estejam lá.
- O ``Base`` compartilhado também tem as tabelas do ``historico`` (que chamam
  ``create_all`` por conta própria); o ``env.py`` do Alembic só gerencia as
  tabelas da Parte 1. "Sem ``create_all``" vale para o código da Parte 1
  (``create_app``, ``app/db`` e ``app/autenticacao``).

As migrations rodam em SQLite de ``tmp_path``; ``backend/choosen.db`` nunca é usado.
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path

import argon2
import pytest
from argon2 import PasswordHasher, Type
from argon2.profiles import RFC_9106_LOW_MEMORY
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import NullPool

from app.core import seguranca
from app.core.config import BACKEND_DIR, Configuracao, carregar_configuracao
from app.main import CABECALHOS_CORS, METODOS_CORS, create_app
from app.tests.conftest import (
    BANCO_DESENVOLVIMENTO,
    HASH_FICTICIO_PRODUCAO,
    migrar,
)

HEALTH = "/api/v1/health"
CADASTRO = "/api/v1/auth/cadastro"
LOGOUT = "/api/v1/auth/logout"
PERFIL = "/api/v1/usuarios/me"

ORIGEM_PADRAO = "http://localhost:5173"
ORIGEM_ESTRANHA = "http://malicioso.example"
TABELAS_PARTE_1 = {"usuario", "sessao", "token_redefinicao"}
AMBIENTES = ("development", "test", "production")
_FALLBACKS = ("DATABASE_URL", "CORS_ORIGINS")

PACOTES_DESIGN = {
    "fastapi", "uvicorn", "sqlalchemy", "alembic", "pydantic",
    "pydantic-settings", "argon2-cffi", "pytest", "httpx", "hypothesis",
}
_LINHA_FIXADA = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[A-Za-z0-9._,-]+\])?==([0-9A-Za-z.+!_-]+)$")


# --- Auxiliares ----------------------------------------------------------------


def _limpar_ambiente(mp: pytest.MonkeyPatch) -> None:
    """Remove todas as variáveis que a configuração lê (só dentro do ``mp``)."""
    for nome in list(os.environ):
        if nome.upper().startswith("CHOOSEN_") or nome.upper() in _FALLBACKS:
            mp.delenv(nome, raising=False)


def _url_sqlite(caminho: Path) -> str:
    return f"sqlite:///{caminho.resolve().as_posix()}"


def _tabelas(caminho: Path) -> set[str]:
    engine = create_engine(_url_sqlite(caminho), poolclass=NullPool)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _preflight(cliente: TestClient, origem: str, metodo: str = "POST",
               cabecalhos: str = "Authorization, Content-Type"):
    return cliente.options(
        HEALTH,
        headers={
            "Origin": origem,
            "Access-Control-Request-Method": metodo,
            "Access-Control-Request-Headers": cabecalhos,
        },
    )


def _lista_cabecalho(valor: str) -> set[str]:
    return {item.strip().lower() for item in valor.split(",") if item.strip()}


def _health_rapido(cliente: TestClient, headers: dict[str, str] | None = None) -> None:
    inicio = time.perf_counter()
    resposta = cliente.get(HEALTH, headers=headers or {})
    duracao = time.perf_counter() - inicio
    assert resposta.status_code == 200, resposta.text
    assert resposta.json() == {"status": "ok"}
    assert duracao < 1.0, f"health levou {duracao:.3f} s"


# --- 13.1 Leitura das variáveis e padrão development ----------------------------


def test_le_as_quatro_variaveis_choosen(monkeypatch, tmp_path):
    _limpar_ambiente(monkeypatch)
    url = _url_sqlite(tmp_path / "outro.db")
    monkeypatch.setenv("CHOOSEN_ENV", "production")
    monkeypatch.setenv("CHOOSEN_DATABASE_URL", url)
    monkeypatch.setenv("CHOOSEN_CORS_ORIGINS", "http://app.example")
    monkeypatch.setenv("CHOOSEN_SESSION_TTL_MINUTES", "60")

    config = carregar_configuracao()
    assert config.env == "production"
    assert config.database_url == url
    assert config.lista_cors == ["http://app.example"]
    assert config.session_ttl_minutes == 60


def test_padroes_quando_nenhuma_variavel_esta_definida(monkeypatch):
    _limpar_ambiente(monkeypatch)
    config = carregar_configuracao()
    assert config.env == "development"
    assert config.cors_origins == ORIGEM_PADRAO
    assert config.lista_cors == [ORIGEM_PADRAO]
    assert config.session_ttl_minutes == 10080


@pytest.mark.parametrize("ambiente", AMBIENTES)
def test_aceita_os_tres_ambientes(monkeypatch, ambiente):
    _limpar_ambiente(monkeypatch)
    monkeypatch.setenv("CHOOSEN_ENV", ambiente)
    assert carregar_configuracao().env == ambiente


def test_fallbacks_sem_prefixo_e_prioridade_do_choosen(monkeypatch, tmp_path):
    _limpar_ambiente(monkeypatch)
    url_render = _url_sqlite(tmp_path / "render.db")
    monkeypatch.setenv("DATABASE_URL", url_render)
    monkeypatch.setenv("CORS_ORIGINS", "http://render.example")
    config = carregar_configuracao()
    assert config.database_url == url_render
    assert config.lista_cors == ["http://render.example"]

    url_choosen = _url_sqlite(tmp_path / "choosen_prioritario.db")
    monkeypatch.setenv("CHOOSEN_DATABASE_URL", url_choosen)
    monkeypatch.setenv("CHOOSEN_CORS_ORIGINS", "http://choosen.example")
    config = carregar_configuracao()
    assert config.database_url == url_choosen
    assert config.lista_cors == ["http://choosen.example"]


@pytest.mark.parametrize("prefixo", ["postgres://", "postgresql://"])
def test_url_postgres_e_normalizada_para_psycopg(monkeypatch, prefixo):
    _limpar_ambiente(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", f"{prefixo}u:s@db.example:5432/choosen")
    assert carregar_configuracao().database_url == (
        "postgresql+psycopg://u:s@db.example:5432/choosen"
    )


# --- 13.6 e 13.7 Valores inválidos encerram a inicialização ---------------------


@pytest.mark.parametrize("valor", ["prod", "Development", "", "staging"])
def test_choosen_env_invalido_encerra_com_mensagem(monkeypatch, valor):
    _limpar_ambiente(monkeypatch)
    monkeypatch.setenv("CHOOSEN_ENV", valor)
    with pytest.raises(SystemExit) as erro:
        carregar_configuracao()
    mensagem = str(erro.value.code)
    assert "CHOOSEN_ENV" in mensagem
    assert all(ambiente in mensagem for ambiente in AMBIENTES)


@pytest.mark.parametrize("valor", ["0", "525601", "-1", "10.0", "abc", " "])
def test_ttl_invalido_encerra_com_mensagem(monkeypatch, valor):
    _limpar_ambiente(monkeypatch)
    monkeypatch.setenv("CHOOSEN_SESSION_TTL_MINUTES", valor)
    with pytest.raises(SystemExit) as erro:
        carregar_configuracao()
    mensagem = str(erro.value.code)
    assert "CHOOSEN_SESSION_TTL_MINUTES" in mensagem
    assert "1" in mensagem and "525600" in mensagem


@pytest.mark.parametrize(
    ("variavel", "valor"),
    [("CHOOSEN_ENV", "qa"), ("CHOOSEN_SESSION_TTL_MINUTES", "0")],
)
def test_create_app_nao_monta_app_com_configuracao_invalida(monkeypatch, tmp_path, variavel, valor):
    _limpar_ambiente(monkeypatch)
    caminho = tmp_path / "nao_criado.db"
    monkeypatch.setenv("CHOOSEN_DATABASE_URL", _url_sqlite(caminho))
    monkeypatch.setenv(variavel, valor)
    with pytest.raises(SystemExit) as erro:
        create_app()
    assert variavel in str(erro.value.code)
    # A configuração é lida antes de qualquer acesso ao banco.
    assert not caminho.exists()


# --- 13.2 SQLite local como padrão; arquivo criado pelas migrations -------------


def test_banco_padrao_e_sqlite_em_arquivo_dentro_de_backend(monkeypatch):
    _limpar_ambiente(monkeypatch)
    url = carregar_configuracao().database_url
    assert url == f"sqlite:///{(BACKEND_DIR / 'choosen.db').as_posix()}"
    caminho = Path(url.removeprefix("sqlite:///"))
    assert caminho.parent.resolve() == BACKEND_DIR.resolve()
    assert BACKEND_DIR.name == "backend"


def test_alembic_upgrade_head_cria_arquivo_e_as_tres_tabelas(tmp_path):
    caminho = (tmp_path / "novo.db").resolve()
    assert caminho != BANCO_DESENVOLVIMENTO
    assert not caminho.exists()

    migrar(_url_sqlite(caminho))

    assert caminho.exists()
    tabelas = _tabelas(caminho)
    assert TABELAS_PARTE_1 <= tabelas
    # Só as tabelas da Parte 1 e o controle de versão do Alembic.
    assert tabelas == TABELAS_PARTE_1 | {"alembic_version"}


def test_migrations_ficam_em_backend_alembic_versions():
    versoes = BACKEND_DIR / "alembic" / "versions"
    assert (versoes / "0001_autenticacao_inicial.py").is_file()


# --- 13.8 Esquema só por Alembic ------------------------------------------------


def test_create_app_em_banco_vazio_nao_cria_tabelas(monkeypatch, tmp_path):
    caminho = (tmp_path / "vazio.db").resolve()
    monkeypatch.setenv("CHOOSEN_DATABASE_URL", _url_sqlite(caminho))
    app = create_app()
    try:
        with TestClient(app, raise_server_exceptions=False) as cliente:
            assert cliente.get(HEALTH).status_code == 200
            # Uma rota que usa o banco falha (sem tabelas), mas não cria nada.
            resposta = cliente.post(
                CADASTRO,
                json={"name": "Ana", "email": "ana@exemplo.com", "password": "senha-segura-1"},
            )
            assert resposta.status_code == 500
    finally:
        app.state.engine.dispose()

    if caminho.exists():
        assert _tabelas(caminho) == set()


def test_codigo_da_parte_1_nao_chama_create_all():
    app_dir = BACKEND_DIR / "app"
    arquivos = [app_dir / "main.py"]
    arquivos += sorted((app_dir / "db").rglob("*.py"))
    arquivos += sorted((app_dir / "autenticacao").rglob("*.py"))
    assert len(arquivos) > 3
    for arquivo in arquivos:
        assert "create_all" not in arquivo.read_text(encoding="utf-8"), arquivo


# --- 13.3, 13.4 e 13.5 CORS -----------------------------------------------------


def test_cors_padrao_libera_localhost_5173_com_metodos_e_cabecalhos(app_isolada):
    assert app_isolada.config.lista_cors == [ORIGEM_PADRAO]
    cliente = app_isolada.cliente

    for metodo in METODOS_CORS:
        resposta = _preflight(cliente, ORIGEM_PADRAO, metodo=metodo)
        assert resposta.status_code == 200, (metodo, resposta.text)
        assert resposta.headers["access-control-allow-origin"] == ORIGEM_PADRAO

    resposta = _preflight(cliente, ORIGEM_PADRAO)
    assert _lista_cabecalho(resposta.headers["access-control-allow-methods"]) == {
        "get", "post", "put", "patch", "delete", "options",
    }
    permitidos = _lista_cabecalho(resposta.headers["access-control-allow-headers"])
    assert {"authorization", "content-type"} <= permitidos
    # Desvio aprovado: X-Usuario também é liberado (histórico).
    assert "x-usuario" in permitidos
    assert {c.lower() for c in CABECALHOS_CORS} <= permitidos
    assert "access-control-allow-credentials" not in resposta.headers

    simples = cliente.get(HEALTH, headers={"Origin": ORIGEM_PADRAO})
    assert simples.status_code == 200
    assert simples.headers["access-control-allow-origin"] == ORIGEM_PADRAO


def test_cors_recusa_metodo_e_cabecalho_fora_da_lista(app_isolada):
    cliente = app_isolada.cliente
    assert _preflight(cliente, ORIGEM_PADRAO, metodo="TRACE").status_code == 400
    assert _preflight(cliente, ORIGEM_PADRAO, cabecalhos="X-Outro").status_code == 400


def test_cors_padrao_nao_libera_origem_estranha(app_isolada):
    cliente = app_isolada.cliente

    preflight = _preflight(cliente, ORIGEM_ESTRANHA)
    assert "access-control-allow-origin" not in preflight.headers

    simples = cliente.get(HEALTH, headers={"Origin": ORIGEM_ESTRANHA})
    assert simples.status_code == 200
    assert "access-control-allow-origin" not in simples.headers


def test_cors_configurado_com_espacos_libera_so_as_origens_da_lista(criar_app_isolada):
    origens = " http://app.example ,http://outro.example:3000 , "
    with criar_app_isolada(ambiente={"CHOOSEN_CORS_ORIGINS": origens}) as ctx:
        assert ctx.config.lista_cors == ["http://app.example", "http://outro.example:3000"]
        cliente = ctx.cliente

        for origem in ("http://app.example", "http://outro.example:3000"):
            resposta = _preflight(cliente, origem, metodo="PATCH")
            assert resposta.status_code == 200
            assert resposta.headers["access-control-allow-origin"] == origem
            assert _lista_cabecalho(resposta.headers["access-control-allow-methods"]) == {
                m.lower() for m in METODOS_CORS
            }
            assert {"authorization", "content-type"} <= _lista_cabecalho(
                resposta.headers["access-control-allow-headers"]
            )
            simples = cliente.get(HEALTH, headers={"Origin": origem})
            assert simples.headers["access-control-allow-origin"] == origem

        # A origem padrão deixa de valer quando a lista é configurada.
        for origem in (ORIGEM_PADRAO, ORIGEM_ESTRANHA, " http://app.example"):
            assert "access-control-allow-origin" not in _preflight(cliente, origem).headers
            simples = cliente.get(HEALTH, headers={"Origin": origem})
            assert "access-control-allow-origin" not in simples.headers


# --- 13.10 Health ---------------------------------------------------------------


def _cadastrar(cliente: TestClient, email: str) -> str:
    resposta = cliente.post(
        CADASTRO, json={"name": "Ana", "email": email, "password": "senha-segura-1"}
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()["token"]


def test_health_responde_200_rapido_sem_e_com_tokens_invalidos(criar_app_isolada):
    with criar_app_isolada(ambiente={"CHOOSEN_SESSION_TTL_MINUTES": "5"}) as ctx:
        cliente, relogio = ctx.cliente, ctx.relogio

        revogado = _cadastrar(cliente, "revogado@exemplo.com")
        assert cliente.post(LOGOUT, headers=_bearer(revogado)).status_code == 204

        expirado = _cadastrar(cliente, "expirado@exemplo.com")
        relogio.avancar(minutes=10)
        assert cliente.get(PERFIL, headers=_bearer(expirado)).status_code == 401
        assert cliente.get(PERFIL, headers=_bearer(revogado)).status_code == 401

        variacoes = [
            None,
            {"Authorization": ""},
            {"Authorization": "Bearer"},
            {"Authorization": "Bearer token-que-nao-existe"},
            {"Authorization": "Basic dXN1YXJpbzpzZW5oYQ=="},
            _bearer(expirado),
            _bearer(revogado),
        ]
        for headers in variacoes:
            _health_rapido(cliente, headers)


def test_health_nao_acessa_o_banco(monkeypatch, tmp_path):
    # Banco em pasta inexistente: qualquer conexão falharia.
    inexistente = tmp_path / "pasta_que_nao_existe" / "x.db"
    monkeypatch.setenv("CHOOSEN_DATABASE_URL", _url_sqlite(inexistente))
    app = create_app()
    try:
        with TestClient(app) as cliente:
            _health_rapido(cliente, _bearer("qualquer"))
            # Desvio aprovado: a rota antiga /health continua respondendo.
            antiga = cliente.get("/health")
            assert antiga.status_code == 200
            assert antiga.json() == {"status": "ok"}
    finally:
        app.state.engine.dispose()
    assert not inexistente.parent.exists()


# --- 13.9 Dependências fixadas --------------------------------------------------


def test_requirements_so_com_versoes_exatas():
    arquivo = BACKEND_DIR / "requirements.txt"
    assert arquivo.is_file()

    nomes: set[str] = set()
    for numero, bruta in enumerate(arquivo.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.strip()
        if not linha or linha.startswith("#"):
            continue
        casamento = _LINHA_FIXADA.fullmatch(linha)
        assert casamento, f"linha {numero} sem versão exata: {bruta!r}"
        nomes.add(casamento.group(1).lower().replace("_", "-"))

    assert PACOTES_DESIGN <= nomes, PACOTES_DESIGN - nomes
    # Desvio aprovado: driver do Postgres e base de fusos.
    assert {"psycopg", "tzdata"} <= nomes


# --- Hasher de produção ---------------------------------------------------------


def test_hasher_de_producao_e_argon2id_com_parametros_padrao(hasher_producao):
    assert isinstance(hasher_producao, PasswordHasher)
    padrao = PasswordHasher()
    assert hasher_producao.type is Type.ID
    assert hasher_producao.time_cost == padrao.time_cost == RFC_9106_LOW_MEMORY.time_cost
    assert hasher_producao.memory_cost == padrao.memory_cost == RFC_9106_LOW_MEMORY.memory_cost
    assert hasher_producao.parallelism == padrao.parallelism == RFC_9106_LOW_MEMORY.parallelism
    assert hasher_producao.hash_len == padrao.hash_len
    assert hasher_producao.salt_len == padrao.salt_len

    hash_senha = hasher_producao.hash("senha-segura-1")
    assert hash_senha.startswith("$argon2id$")
    assert argon2.extract_parameters(hash_senha) == RFC_9106_LOW_MEMORY
    assert hasher_producao.verify(hash_senha, "senha-segura-1")

    # O hash fictício do login (e-mail inexistente) também nasceu com o hasher de produção.
    assert argon2.extract_parameters(HASH_FICTICIO_PRODUCAO) == RFC_9106_LOW_MEMORY


def test_modulo_de_seguranca_instancia_o_hasher_sem_parametros():
    fonte = Path(seguranca.__file__).read_text(encoding="utf-8")
    assert re.search(r"^_hasher: PasswordHasher = PasswordHasher\(\)$", fonte, re.MULTILINE)


# --- 13.12 Ambiente de teste isolado --------------------------------------------


def test_testes_rodam_em_ambiente_test_com_banco_isolado(app_isolada):
    assert os.environ["CHOOSEN_ENV"] == "test"
    assert app_isolada.config.env == "test"
    assert isinstance(app_isolada.config, Configuracao)
    assert app_isolada.caminho_db.resolve() != BANCO_DESENVOLVIMENTO
    assert TABELAS_PARTE_1 <= set(inspect(app_isolada.engine).get_table_names())
