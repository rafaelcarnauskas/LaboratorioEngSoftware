"""Tarefa 6.20: rotas registradas pela Parte 1 e convivência com as partes 2 a 5.

Adaptação por decisão do usuário: o spec (Requisito 11.6) pede que `comunidades`,
`videos`, `busca_listas` e `historico` fiquem sem rotas. O repositório, porém, já
tem o código dos colegas nessas pastas (comunidades e historico incluídos em
`main.py`; videos com `create_router`, ainda fora do app), e o usuário decidiu
integrar com ele em vez de apagá-lo. Por isso este teste NÃO afirma a ausência
das partes 2 a 5. Ele confere:

(a) que as rotas sob `/api/v1/auth`, `/api/v1/usuarios` e `/api/v1/health` são
    exatamente as 10 do design, com os métodos esperados;
(b) que nenhum módulo fora da Parte 1 define rotas sob `/api/v1/auth` ou
    `/api/v1/usuarios`;
(c) que as demais rotas pertencem só aos prefixos conhecidos dos colegas
    (`/api/v1/comunidades`, `/api/v1/historico` e `/api/v1/tempo`, este último
    também do router do histórico), além de `/health` e da documentação do
    FastAPI, para que uma rota nova inesperada seja detectada;
(d) que o código dos colegas não importa internals da Parte 1 (Requisito 11.5):
    hoje nenhum deles importa `app.autenticacao`; o único acesso permitido
    seria `obter_usuario_atual` e `buscar_por_id`;
e, da própria tarefa, que as rotas públicas não exigem sessão e as protegidas
respondem 401 sem `Authorization` (Requisito 10.1).
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from fastapi.routing import APIRoute

try:
    from fastapi.routing import iter_route_contexts
except ImportError:  # FastAPI anterior à inclusão preguiçosa de routers
    iter_route_contexts = None

from app.autenticacao.api import obter_sessao_atual, obter_usuario_atual

APP_DIR = Path(__file__).resolve().parents[1]

# Os 10 endpoints da tabela do design (seção da API), com o prefixo /api/v1.
ROTAS_PARTE_1 = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/cadastro"),
    ("GET", "/api/v1/auth/email-em-uso"),
    ("POST", "/api/v1/auth/redefinicao-senha"),
    ("POST", "/api/v1/auth/redefinicao-senha/confirmacao"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/usuarios/me"),
    ("PATCH", "/api/v1/usuarios/me"),
    ("PUT", "/api/v1/usuarios/me/senha"),
    ("GET", "/api/v1/health"),
}
ROTAS_PUBLICAS = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/cadastro"),
    ("GET", "/api/v1/auth/email-em-uso"),
    ("POST", "/api/v1/auth/redefinicao-senha"),
    ("POST", "/api/v1/auth/redefinicao-senha/confirmacao"),
    ("GET", "/api/v1/health"),
}
ROTAS_PROTEGIDAS = ROTAS_PARTE_1 - ROTAS_PUBLICAS

PREFIXOS_PARTE_1 = ("/api/v1/auth", "/api/v1/usuarios")
PREFIXOS_COLEGAS = ("/api/v1/comunidades", "/api/v1/historico", "/api/v1/tempo")
ROTAS_FASTAPI = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
MODULOS_PARTE_1 = ("app.autenticacao", "app.main")

PASTAS_COLEGAS = ("comunidades", "videos", "busca_listas", "historico")
IMPORTS_PERMITIDOS = {"obter_usuario_atual", "buscar_por_id"}


def _sob(caminho: str, prefixo: str) -> bool:
    return caminho == prefixo or caminho.startswith(prefixo + "/")


def _todas_as_rotas(app) -> list:
    """Rotas efetivas do app, com o prefixo aplicado.

    A partir do FastAPI 0.143 os routers incluídos aparecem em ``app.routes``
    como um nó único (``_IncludedRouter``); ``iter_route_contexts`` os expande.
    Em versões sem essa função, ``app.routes`` já vem achatado.
    """
    if iter_route_contexts is None:
        return list(app.routes)
    return list(iter_route_contexts(app.routes))


def _rotas_api(app) -> list:
    """Rotas de API (com ``endpoint`` e ``dependant``), sem as do FastAPI."""
    rotas = []
    for rota in _todas_as_rotas(app):
        original = getattr(rota, "original_route", rota)
        if isinstance(original, APIRoute):
            rotas.append(rota)
    return rotas


def _dependant(rota):
    return getattr(rota, "original_route", rota).dependant


def _pares(rota) -> set[tuple[str, str]]:
    return {(metodo, rota.path) for metodo in set(rota.methods) - {"HEAD"}}


def _e_da_parte_1(caminho: str) -> bool:
    return caminho == "/api/v1/health" or any(_sob(caminho, p) for p in PREFIXOS_PARTE_1)


def _chamadas(dependant) -> set:
    """Todas as funções de dependência da árvore de ``dependant``."""
    encontradas = set()
    for dep in dependant.dependencies:
        encontradas.add(dep.call)
        encontradas |= _chamadas(dep)
    return encontradas


# (a) -------------------------------------------------------------------------

def test_rotas_da_parte_1_sao_exatamente_as_10_do_design(app_isolada):
    registradas: set[tuple[str, str]] = set()
    for rota in _rotas_api(app_isolada.app):
        if _e_da_parte_1(rota.path):
            registradas |= _pares(rota)

    assert registradas == ROTAS_PARTE_1


def test_cada_rota_da_parte_1_aparece_uma_unica_vez(app_isolada):
    pares = [par for rota in _rotas_api(app_isolada.app) if _e_da_parte_1(rota.path)
             for par in _pares(rota)]
    assert len(pares) == len(set(pares)) == 10


# (b) -------------------------------------------------------------------------

def test_nenhum_modulo_fora_da_parte_1_define_rotas_de_auth_ou_usuarios(app_isolada):
    intrusas = [
        (sorted(rota.methods), rota.path, rota.endpoint.__module__)
        for rota in _rotas_api(app_isolada.app)
        if _e_da_parte_1(rota.path) and not rota.endpoint.__module__.startswith(MODULOS_PARTE_1)
    ]
    assert intrusas == []


@pytest.mark.parametrize("pasta", PASTAS_COLEGAS)
def test_codigo_dos_colegas_nao_declara_caminhos_de_auth_ou_usuarios(pasta):
    # Cobre também `videos`, cujo router ainda não está incluído no app.
    caminhos = []
    for arquivo in (APP_DIR / pasta).glob("*.py"):
        for no in ast.walk(ast.parse(arquivo.read_text(encoding="utf-8"))):
            if isinstance(no, ast.Constant) and isinstance(no.value, str):
                texto = no.value
                if texto.startswith(("/auth", "/usuarios", "/api/v1/auth", "/api/v1/usuarios")):
                    caminhos.append((arquivo.name, texto))
    assert caminhos == []


# (c) -------------------------------------------------------------------------

def test_demais_rotas_pertencem_so_aos_prefixos_conhecidos(app_isolada):
    inesperadas = []
    for rota in _todas_as_rotas(app_isolada.app):
        caminho = getattr(rota, "path", None)
        if caminho is None:  # nó de router não expandido: também é inesperado
            inesperadas.append(repr(rota))
            continue
        if _e_da_parte_1(caminho) or caminho == "/health" or caminho in ROTAS_FASTAPI:
            continue
        if any(_sob(caminho, p) for p in PREFIXOS_COLEGAS):
            continue
        inesperadas.append(caminho)
    assert inesperadas == []


def test_rotas_dos_colegas_vem_dos_modulos_deles(app_isolada):
    origem = {
        "/api/v1/comunidades": "app.comunidades",
        "/api/v1/historico": "app.historico",
        "/api/v1/tempo": "app.historico",
    }
    for rota in _rotas_api(app_isolada.app):
        for prefixo, modulo in origem.items():
            if _sob(rota.path, prefixo):
                assert rota.endpoint.__module__.startswith(modulo), rota.path


def test_health_legado_continua_disponivel(app_isolada):
    legado = [r for r in _rotas_api(app_isolada.app) if r.path == "/health"]
    assert len(legado) == 1 and set(legado[0].methods) == {"GET"}
    assert app_isolada.cliente.get("/health").json() == {"status": "ok"}


# (d) -------------------------------------------------------------------------

def _imports_de_autenticacao(arquivo: Path) -> list[tuple[str, str]]:
    achados = []
    for no in ast.walk(ast.parse(arquivo.read_text(encoding="utf-8"))):
        if isinstance(no, ast.Import):
            achados += [(a.name, "*") for a in no.names
                        if a.name == "app.autenticacao" or a.name.startswith("app.autenticacao.")]
        elif isinstance(no, ast.ImportFrom) and no.level == 0 and no.module and (
            no.module == "app.autenticacao" or no.module.startswith("app.autenticacao.")
        ):
            achados += [(no.module, a.name) for a in no.names]
    return achados


@pytest.mark.parametrize("pasta", PASTAS_COLEGAS)
def test_colegas_nao_importam_internals_da_parte_1(pasta):
    proibidos = []
    for arquivo in (APP_DIR / pasta).glob("*.py"):
        for modulo, nome in _imports_de_autenticacao(arquivo):
            if nome not in IMPORTS_PERMITIDOS:
                proibidos.append((arquivo.name, modulo, nome))
    assert proibidos == []


@pytest.mark.parametrize("pasta", PASTAS_COLEGAS)
def test_hoje_os_colegas_nao_importam_nada_de_app_autenticacao(pasta):
    # Estado atual do repositório; se alguém passar a usar o contrato
    # (obter_usuario_atual/buscar_por_id), basta remover este teste.
    importados = [(arquivo.name, imp) for arquivo in (APP_DIR / pasta).glob("*.py")
                  for imp in _imports_de_autenticacao(arquivo)]
    assert importados == []


# Proteção das rotas (Requisito 10.1) -----------------------------------------

def test_rotas_publicas_nao_dependem_de_sessao(app_isolada):
    for rota in _rotas_api(app_isolada.app):
        if _pares(rota) & ROTAS_PUBLICAS:
            deps = _chamadas(_dependant(rota))
            assert obter_usuario_atual not in deps, rota.path
            assert obter_sessao_atual not in deps, rota.path


def test_rotas_protegidas_dependem_de_sessao(app_isolada):
    for rota in _rotas_api(app_isolada.app):
        if _pares(rota) & ROTAS_PROTEGIDAS:
            assert obter_sessao_atual in _chamadas(_dependant(rota)), rota.path


@pytest.mark.parametrize("metodo,caminho", sorted(ROTAS_PROTEGIDAS))
def test_rotas_protegidas_respondem_401_sem_authorization(app_isolada, metodo, caminho):
    resposta = app_isolada.cliente.request(metodo, caminho, json={})
    assert resposta.status_code == 401
    assert resposta.json()["error"]["code"] == "sessao_invalida"
    assert resposta.headers.get("www-authenticate") == "Bearer"


def test_rotas_publicas_respondem_sem_authorization(app_isolada):
    cliente = app_isolada.cliente
    assert cliente.get("/api/v1/health").status_code == 200
    assert cliente.get("/api/v1/auth/email-em-uso", params={"email": "x@y.com"}).status_code == 200
    assert cliente.post("/api/v1/auth/redefinicao-senha",
                        json={"email": "ninguem@exemplo.com"}).status_code == 202
    # Corpos inválidos: a resposta é de validação, nunca de sessão.
    for caminho in ("/api/v1/auth/login", "/api/v1/auth/cadastro",
                    "/api/v1/auth/redefinicao-senha/confirmacao"):
        assert cliente.post(caminho, json={}).status_code == 422, caminho
