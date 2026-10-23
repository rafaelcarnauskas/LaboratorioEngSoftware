from fastapi.testclient import TestClient

from app.db.base import database_url
from app.main import app


def test_health():
    assert TestClient(app).get("/health").json() == {"status": "ok"}


def test_cors_libera_o_front_e_o_cabecalho_de_usuario():
    r = TestClient(app).options("/api/v1/historico", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-usuario",
    })
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_bloqueia_origem_desconhecida():
    r = TestClient(app).options("/api/v1/historico", headers={
        "Origin": "http://exemplo.com", "Access-Control-Request-Method": "GET",
    })
    assert "access-control-allow-origin" not in r.headers


def test_database_url_converte_url_do_render(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:s@host/db")
    assert database_url() == "postgresql+psycopg://u:s@host/db"
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:s@host/db")
    assert database_url() == "postgresql+psycopg://u:s@host/db"
    monkeypatch.delenv("DATABASE_URL")
    assert database_url().startswith("sqlite")


def test_primeiro_acesso_simultaneo_nao_quebra_a_criacao_de_tabelas(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    from app.busca_listas.modelo import RepositorioSQL as Listas
    from app.db.base import criar_engine
    from app.historico.modelo import RepositorioSQL as Historico

    url = f"sqlite:///{tmp_path / 'corrida.db'}"
    fabricas = [lambda: Historico(criar_engine(url)), lambda: Listas(criar_engine(url))] * 8
    with ThreadPoolExecutor(max_workers=16) as pool:
        repos = list(pool.map(lambda criar: criar(), fabricas))
    assert len(repos) == 16
