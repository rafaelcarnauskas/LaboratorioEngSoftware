"""Interface remota (HTTP) da API de Dados Compartilhados.

Rotas sob ``/api/v1/infra/dados``, para serviços, não para o navegador. Quem
chama se identifica com ``X-Servico`` e ``X-Credencial``; a credencial é
conferida com ``servico.hash_credencial`` e a operação, com ``permissao``.

- ``GET  /{tabela}?coluna=v1&coluna=v2`` lista as linhas (filtro por igualdade);
- ``GET  /{tabela}/{chave}`` devolve uma linha ou 404;
- ``PUT  /{tabela}/{chave}`` cria ou atualiza (só o dono da tabela).
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Header, HTTPException, Request

from app.infraestrutura.dados import AcessoNegado, ServidorDadosCompartilhados, TabelaDesconhecida

router = APIRouter(prefix="/api/v1/infra/dados", tags=["infraestrutura"])


def _servidor(request: Request) -> ServidorDadosCompartilhados:
    return request.app.state.plataforma.servidor_dados


def _autenticar(request: Request, servico: str | None, credencial: str | None) -> ServidorDadosCompartilhados:
    servidor = _servidor(request)
    if not servico or not credencial or not servidor.autenticar(servico, credencial):
        raise HTTPException(status_code=401, detail="Serviço não autenticado.")
    return servidor


def _executar(funcao, *args):
    try:
        return funcao(*args)
    except AcessoNegado as erro:
        raise HTTPException(status_code=403, detail=str(erro)) from erro
    except TabelaDesconhecida as erro:
        raise HTTPException(status_code=404, detail="Tabela desconhecida.") from erro
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro


@router.get("/{tabela}")
def listar(tabela: str, request: Request, x_servico: str | None = Header(default=None),
           x_credencial: str | None = Header(default=None)) -> list[dict]:
    servidor = _autenticar(request, x_servico, x_credencial)
    filtros: dict[str, list[str]] = {}
    for coluna, valor in request.query_params.multi_items():
        filtros.setdefault(coluna, []).append(valor)
    return _executar(servidor.listar, x_servico, tabela, filtros)


@router.get("/{tabela}/{chave}")
def obter(tabela: str, chave: str, request: Request, x_servico: str | None = Header(default=None),
          x_credencial: str | None = Header(default=None)) -> dict:
    servidor = _autenticar(request, x_servico, x_credencial)
    linha = _executar(servidor.obter, x_servico, tabela, chave)
    if linha is None:
        raise HTTPException(status_code=404, detail="Linha não encontrada.")
    return linha


@router.put("/{tabela}/{chave}")
def gravar(tabela: str, chave: str, request: Request, dados: dict = Body(...),
           x_servico: str | None = Header(default=None),
           x_credencial: str | None = Header(default=None)) -> dict:
    servidor = _autenticar(request, x_servico, x_credencial)
    return _executar(servidor.gravar, x_servico, tabela, dados)
