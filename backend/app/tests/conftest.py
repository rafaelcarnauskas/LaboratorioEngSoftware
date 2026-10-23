"""Infraestrutura dos testes do Backend (Requisito 13.12).

Rode em ``backend/`` com ``python -m pytest app/tests``. Este arquivo é carregado
antes de qualquer módulo de teste e garante, já na importação:

- ``CHOOSEN_ENV=test`` antes de ``app.main`` ser importado;
- nenhuma variável ``CHOOSEN_*``, ``DATABASE_URL`` ou ``CORS_ORIGINS`` da máquina
  vaza para os testes. ``CHOOSEN_DATABASE_URL`` e ``DATABASE_URL`` passam a ser
  SQLite em memória (``sqlite://``), então o ``app`` de módulo de ``app.main``
  (usado por ``test_main.py`` e ``test_comunidades.py``) e o repositório do
  ``historico`` (que lê ``DATABASE_URL`` direto) nunca abrem ``backend/choosen.db``;
- ``PasswordHasher`` com parâmetros mínimos (``time_cost=1, memory_cost=8,
  parallelism=1``) via ``definir_hasher``. O hasher de produção fica em
  ``HASHER_PRODUCAO`` (e na fixture ``hasher_producao``); ``HASH_FICTICIO`` é
  refeito com o hasher de teste e o original fica em ``HASH_FICTICIO_PRODUCAO``.

Durante a sessão, ``socket.connect`` só aceita destinos locais (loopback, usado
pelo event loop do ``TestClient`` no Windows): qualquer acesso à rede falha.

Fixtures e helpers
------------------
``banco_modelo`` (sessão)
    ``Path`` de um SQLite criado uma vez com ``alembic upgrade head``.
``criar_app_isolada`` (sessão)
    ``criar_app_isolada(inicio=None, ambiente=None) -> AppIsolada``: copia o
    banco-modelo para um arquivo novo e chama ``create_app()`` com
    ``CHOOSEN_DATABASE_URL`` apontando para a cópia (``ambiente`` acrescenta
    variáveis, por exemplo ``{"CHOOSEN_ENV": "development"}`` ou
    ``{"CHOOSEN_SESSION_TTL_MINUTES": "5"}``). Nos testes Hypothesis, use uma
    cópia por exemplo, dentro do corpo do teste::

        @settings(max_examples=100, deadline=None)
        @given(email=emails_validos())
        def test_x(criar_app_isolada, email):
            with criar_app_isolada() as ctx:
                ctx.cliente.post(...)

``AppIsolada``
    ``app``, ``cliente`` (``TestClient``), ``relogio`` (``RelogioControlado``,
    já ligado a ``app.dependency_overrides[obter_relogio]``), ``engine``,
    ``session_local``, ``config``, ``caminho_db``; ``sessao()`` abre uma
    ``Session`` (use com ``with``); ``novo_cliente(**kw)`` cria outro
    ``TestClient`` (por exemplo para threads ou ``raise_server_exceptions=False``);
    ``fechar()`` (ou o fim do ``with``) fecha clientes, descarta o engine e
    apaga a cópia.
``RelogioControlado``
    ``agora()``, ``avancar(timedelta)`` / ``avancar(minutes=5)`` e
    ``definir(datetime_com_fuso)``. Começa em ``INSTANTE_INICIAL`` (UTC).
``app_isolada``, ``cliente``, ``relogio``, ``db`` (função)
    Uma ``AppIsolada`` nova por teste e atalhos para o cliente, o relógio e uma
    ``Session`` do mesmo banco. A ``db`` é outra conexão: faça ``commit`` antes
    de chamar a API se escreveu algo, e ``db.expire_all()`` para reler o que a
    API gravou.

Os geradores Hypothesis ficam em ``app/tests/estrategias.py``.
"""

from __future__ import annotations

import itertools
import os
import secrets
import shutil
import socket
from collections.abc import Iterator, Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

# --- Ambiente: precisa vir antes de qualquer import de app.main --------------

_FALLBACKS_SEM_PREFIXO = ("DATABASE_URL", "CORS_ORIGINS")


def _limpar_ambiente() -> None:
    for nome in list(os.environ):
        if nome.upper().startswith("CHOOSEN_") or nome.upper() in _FALLBACKS_SEM_PREFIXO:
            del os.environ[nome]


_limpar_ambiente()
os.environ["CHOOSEN_ENV"] = "test"
# Em memória: o app de módulo de app.main e o repositório do histórico nunca
# tocam backend/choosen.db. Testes da Parte 1 usam criar_app_isolada().
os.environ["CHOOSEN_DATABASE_URL"] = "sqlite://"
os.environ["DATABASE_URL"] = "sqlite://"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from argon2 import PasswordHasher  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.core import seguranca  # noqa: E402
from app.core.config import BACKEND_DIR, Configuracao  # noqa: E402
from app.core.relogio import obter_relogio  # noqa: E402

# --- Argon2 rápido nos testes ------------------------------------------------

HASHER_TESTE = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)
HASHER_PRODUCAO: PasswordHasher = seguranca.definir_hasher(HASHER_TESTE)
HASH_FICTICIO_PRODUCAO: str = seguranca.HASH_FICTICIO
# Antes de app.autenticacao.servico ser importado pelos testes, para que até um
# `from app.core.seguranca import HASH_FICTICIO` pegue o hash rápido.
seguranca.HASH_FICTICIO = seguranca.gerar_hash_senha(secrets.token_urlsafe(32))

from app.main import create_app  # noqa: E402

# --- Proteções ---------------------------------------------------------------

BANCO_DESENVOLVIMENTO = (BACKEND_DIR / "choosen.db").resolve()
_HOSTS_LOCAIS = frozenset({"127.0.0.1", "::1", "localhost", "0.0.0.0", "::"})


def _url_sqlite(caminho: Path) -> str:
    return f"sqlite:///{caminho.resolve().as_posix()}"


def _exigir_banco_isolado(caminho: Path) -> None:
    if caminho.resolve() == BANCO_DESENVOLVIMENTO:
        raise RuntimeError("Os testes não podem usar backend/choosen.db.")


def _destino_local(endereco) -> bool:
    if isinstance(endereco, (str, bytes)):  # AF_UNIX
        return True
    host = endereco[0]
    if isinstance(host, bytes):
        host = host.decode()
    return host in _HOSTS_LOCAIS or str(host).startswith("127.")


_connect_original = socket.socket.connect
_connect_ex_original = socket.socket.connect_ex


def _connect_local(self, endereco):
    if not _destino_local(endereco):
        raise RuntimeError(f"Teste tentou acessar a rede: {endereco!r}")
    return _connect_original(self, endereco)


def _connect_ex_local(self, endereco):
    if not _destino_local(endereco):
        raise RuntimeError(f"Teste tentou acessar a rede: {endereco!r}")
    return _connect_ex_original(self, endereco)


@pytest.fixture(scope="session", autouse=True)
def _sem_rede() -> Iterator[None]:
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(socket.socket, "connect", _connect_local)
        mp.setattr(socket.socket, "connect_ex", _connect_ex_local)
        yield


# --- Relógio controlado ------------------------------------------------------

INSTANTE_INICIAL = datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC)


def _exigir_fuso(instante: datetime) -> datetime:
    if instante.tzinfo is None or instante.utcoffset() is None:
        raise ValueError("RelogioControlado só aceita datetime com fuso.")
    return instante.astimezone(UTC)


class RelogioControlado:
    """Relógio falso para ``app.dependency_overrides[obter_relogio]``."""

    def __init__(self, inicio: datetime | None = None) -> None:
        self._agora = _exigir_fuso(inicio or INSTANTE_INICIAL)

    def agora(self) -> datetime:
        return self._agora

    def avancar(self, delta: timedelta | None = None, **partes: float) -> datetime:
        """Avança por ``delta`` ou por ``timedelta(**partes)``; devolve o novo instante."""
        if delta is None:
            delta = timedelta(**partes)
        elif partes:
            raise TypeError("Use delta ou partes nomeadas, não os dois.")
        self._agora = self._agora + delta
        return self._agora

    def definir(self, instante: datetime) -> datetime:
        self._agora = _exigir_fuso(instante)
        return self._agora

    def __repr__(self) -> str:
        return f"RelogioControlado({self._agora.isoformat()})"


# --- Banco-modelo e apps isoladas --------------------------------------------


def migrar(url: str) -> None:
    """Roda ``alembic upgrade head`` em ``url``.

    O ``Config`` é montado sem ``alembic.ini`` para que o ``env.py`` não chame
    ``fileConfig`` (que reconfiguraria o logging e atrapalharia o ``caplog``).
    """
    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic").replace("%", "%%"))
    cfg.set_main_option("path_separator", "os")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("CHOOSEN_DATABASE_URL", url)
        command.upgrade(cfg, "head")


class AppIsolada:
    """App FastAPI sobre uma cópia própria do banco-modelo."""

    def __init__(self, caminho_db: Path, inicio: datetime | None,
                 ambiente: Mapping[str, str] | None) -> None:
        _exigir_banco_isolado(caminho_db)
        self.caminho_db = caminho_db
        self.url = _url_sqlite(caminho_db)
        with pytest.MonkeyPatch.context() as mp:
            for nome, valor in (ambiente or {}).items():
                mp.setenv(nome, valor)
            mp.setenv("CHOOSEN_DATABASE_URL", self.url)
            self.app: FastAPI = create_app()
        self.config: Configuracao = self.app.state.config
        self.engine: Engine = self.app.state.engine
        self.session_local: sessionmaker = self.app.state.session_local
        self.relogio = RelogioControlado(inicio)
        self.app.dependency_overrides[obter_relogio] = self.relogio.agora
        self._clientes: list[TestClient] = []
        self.cliente = self.novo_cliente()

    def novo_cliente(self, **kwargs) -> TestClient:
        cliente = TestClient(self.app, **kwargs)
        self._clientes.append(cliente)
        return cliente

    def sessao(self) -> Session:
        return self.session_local()

    def fechar(self) -> None:
        for cliente in self._clientes:
            cliente.close()
        self._clientes.clear()
        self.app.dependency_overrides.clear()
        self.engine.dispose()
        try:
            self.caminho_db.unlink(missing_ok=True)
        except PermissionError:
            pass  # Windows: alguma conexão ainda aberta; o tmp do pytest limpa depois

    def __enter__(self) -> AppIsolada:
        return self

    def __exit__(self, *_exc) -> None:
        self.fechar()


@pytest.fixture(scope="session")
def banco_modelo(tmp_path_factory: pytest.TempPathFactory) -> Path:
    caminho = tmp_path_factory.mktemp("modelo") / "modelo.db"
    _exigir_banco_isolado(caminho)
    migrar(_url_sqlite(caminho))
    return caminho


@pytest.fixture(scope="session")
def criar_app_isolada(banco_modelo: Path, tmp_path_factory: pytest.TempPathFactory):
    """Fábrica de ``AppIsolada``; cada chamada usa uma cópia nova do banco-modelo."""
    diretorio = tmp_path_factory.mktemp("bancos")
    contador = itertools.count(1)

    def _criar(inicio: datetime | None = None,
               ambiente: Mapping[str, str] | None = None) -> AppIsolada:
        destino = diretorio / f"teste_{next(contador)}.db"
        shutil.copyfile(banco_modelo, destino)
        return AppIsolada(destino, inicio, ambiente)

    return _criar


@pytest.fixture
def app_isolada(criar_app_isolada) -> Iterator[AppIsolada]:
    with criar_app_isolada() as ctx:
        yield ctx


@pytest.fixture
def cliente(app_isolada: AppIsolada) -> TestClient:
    return app_isolada.cliente


@pytest.fixture
def relogio(app_isolada: AppIsolada) -> RelogioControlado:
    return app_isolada.relogio


@pytest.fixture
def db(app_isolada: AppIsolada) -> Iterator[Session]:
    sessao = app_isolada.sessao()
    try:
        yield sessao
    finally:
        sessao.close()


@pytest.fixture
def hasher_producao() -> PasswordHasher:
    """O ``PasswordHasher`` original de ``app.core.seguranca`` (parâmetros padrão)."""
    return HASHER_PRODUCAO
