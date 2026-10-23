"""Aplicação FastAPI do Choosen.

`uvicorn app.main:app` importa este módulo, que chama `create_app()`. Como
`create_app()` lê a configuração primeiro, uma variável inválida encerra o
processo antes de a porta abrir (Requisitos 13.6 e 13.7).
"""

import logging
import re

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.busca_listas.api import router as busca_listas_router
from app.busca_listas.api import get_videos as busca_get_videos
from app.comunidades.api import router as comunidades_router
from app.autenticacao.api import obter_usuario_atual, router as autenticacao_router
from app.autenticacao.servico import ErroDominio
from app.core.config import carregar_configuracao
from app.db.sessao import criar_engine, criar_session_local
from app.historico.api import router as historico_router
from app.historico.api import get_repositorio as historico_get_repositorio
from app.historico import servico as historico_servico
from app.videos.api import create_router as create_videos_router
from app.videos.modelo import MockVideoRepository
from app.videos.servico import PlaybackService, VideoService

logger = logging.getLogger("app.main")

METODOS_CORS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
CABECALHOS_CORS = ["Authorization", "Content-Type"]

# Primeiro item de `loc` que indica a origem do valor, não o nome do campo.
_ORIGENS_LOC = {"body", "query", "path", "header", "cookie"}
_SNAKE = re.compile(r"_([a-z0-9])")


def corpo_erro(code: str, message: str, fields: list[dict] | None = None) -> dict:
    """Monta o envelope `{"error": {"code", "message", "fields"}}`; `fields` só quando informado."""
    erro: dict = {"code": code, "message": message}
    if fields is not None:
        erro["fields"] = fields
    return {"error": erro}


def resposta_erro(status: int, code: str, message: str, fields: list[dict] | None = None,
                  headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content=corpo_erro(code, message, fields), headers=headers)


def _camel_case(nome: str) -> str:
    return _SNAKE.sub(lambda m: m.group(1).upper(), nome)


def _nome_do_campo(loc: tuple | list) -> str:
    partes = list(loc)
    if partes and partes[0] in _ORIGENS_LOC:
        origem = partes.pop(0)
    else:
        origem = None
    for parte in partes:
        if isinstance(parte, str):
            return _camel_case(parte)
    # Corpo ausente ou JSON malformado: o erro é do corpo inteiro.
    return origem or "body"


def campos_da_validacao(erros: list[dict]) -> list[dict]:
    """Converte os erros do FastAPI em `[{"field", "message"}]`, um por campo, na ordem recebida."""
    campos: list[dict] = []
    vistos: set[str] = set()
    for erro in erros:
        campo = _nome_do_campo(erro.get("loc", ()))
        if campo in vistos:
            continue
        vistos.add(campo)
        campos.append({"field": campo, "message": str(erro.get("msg", "Valor inválido."))})
    return campos


async def _tratar_validacao(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return resposta_erro(422, "validacao", "Alguns campos são inválidos.",
                         campos_da_validacao(exc.errors()))


async def _tratar_erro_dominio(_request: Request, exc: ErroDominio) -> JSONResponse:
    # `exc.headers` leva, por exemplo, `WWW-Authenticate: Bearer` no 401 sessao_invalida.
    return resposta_erro(exc.status, exc.code, exc.message, exc.fields, exc.headers)


async def _tratar_erro_interno(request: Request, exc: Exception) -> JSONResponse:
    # Detalhes técnicos só no log; o corpo não expõe nada da exceção.
    logger.error("Erro não tratado em %s %s", request.method, request.url.path,
                 exc_info=(type(exc), exc, exc.__traceback__))
    return resposta_erro(500, "erro_interno", "Ocorreu um erro inesperado. Tente novamente.")


def create_app() -> FastAPI:
    config = carregar_configuracao()

    app = FastAPI(title="Choosen API", version="0.1.0")
    app.state.config = config
    # Só cria o engine e a fábrica de sessões; o esquema vem do Alembic (Requisito 13.8).
    app.state.engine = criar_engine(config.database_url)
    app.state.session_local = criar_session_local(app.state.engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.lista_cors,
        allow_credentials=False,  # o token vai no cabeçalho Authorization, não em cookie
        allow_methods=METODOS_CORS,
        allow_headers=CABECALHOS_CORS,
    )

    app.add_exception_handler(ErroDominio, _tratar_erro_dominio)
    app.add_exception_handler(RequestValidationError, _tratar_validacao)
    app.add_exception_handler(Exception, _tratar_erro_interno)

    app.include_router(autenticacao_router, prefix="/api/v1")
    app.include_router(
        comunidades_router,
        prefix="/api/v1",
        dependencies=[Depends(obter_usuario_atual)],
    )
    app.include_router(historico_router)  # já tem o prefixo /api/v1
    app.include_router(busca_listas_router)  # já tem o prefixo /api/v1

    videos = VideoService(MockVideoRepository())
    app.dependency_overrides[busca_get_videos] = lambda: videos
    app.include_router(
        create_videos_router(
            videos,
            PlaybackService(videos, _HistoryRecorder()),
            obter_usuario_atual,
        )
    )

    # Sem dependências: não lê Authorization nem acessa o banco (Requisito 13.10).
    @app.get("/api/v1/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # Rota antiga mantida para quem já usa /health (ex.: health check do Render).
    app.add_api_route("/health", health, methods=["GET"], tags=["health"], include_in_schema=False)

    return app


class _HistoryRecorder:
    """Adapta os registros de reprodução ao contrato do módulo Histórico."""

    def registrar_visualizacao(
        self,
        *,
        usuario_id: str,
        video_id: str,
        segundos_assistidos: int,
        ocorrido_em,
    ) -> None:
        timestamp_ms = int(ocorrido_em.timestamp() * 1000)
        historico_servico.registrar_visualizacao(
            historico_get_repositorio(),
            usuario_id,
            video_id,
            segundos_assistidos,
            timestamp_ms,
        )


app = create_app()
