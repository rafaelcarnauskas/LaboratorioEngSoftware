# Rotas do Serviço de Busca e do Serviço de Listas (parte 4).
# Os campos JSON seguem os nomes do front (name, description, tone, videoIds...).
import time
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.db.base import criar_engine
from app.videos.modelo import MockVideoRepository
from app.videos.servico import VideoNotFoundError, VideoService

from . import modelo, servico

router = APIRouter(prefix="/api/v1", tags=["busca e listas"])

Tom = Literal["gold", "blue", "green", "purple"]


@lru_cache
def get_repositorio():
    return modelo.RepositorioSQL(criar_engine())


@lru_cache
def get_videos():
    # Serviço de Vídeos da parte 3. Trocar pela instância compartilhada quando o
    # router de vídeos for registrado no main.py.
    return VideoService(MockVideoRepository())


def get_agora():
    return int(time.time() * 1000)


# Provisório até a parte 1 (autenticação) existir no back, igual ao Histórico.
def usuario_atual(x_usuario: str | None = Header(default=None)):
    if not x_usuario:
        raise HTTPException(status_code=401, detail="Usuário não identificado")
    return x_usuario


# --- esquemas ---

class VideoResultado(BaseModel):
    id: str
    title: str
    creator: str
    category: str
    communityId: str
    image: str | None
    durationSeconds: int | None


class ListaSaida(BaseModel):
    id: str
    name: str
    description: str
    tone: str
    videoIds: list[str]
    updatedAt: int


class ListaEntrada(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=servico.MAX_NOME)
    description: str = Field(default="", max_length=servico.MAX_DESCRICAO)
    tone: Tom = "gold"


class ListaEdicao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=servico.MAX_NOME)
    description: str | None = Field(default=None, max_length=servico.MAX_DESCRICAO)
    tone: Tom | None = None


class ItemEntrada(BaseModel):
    videoId: str = Field(min_length=1)


class ListasDoVideo(BaseModel):
    listIds: list[str]


def _video(v):
    return VideoResultado(id=v.id, title=v.title, creator=v.author, category=v.category,
                          communityId=v.community_id, image=v.image,
                          durationSeconds=servico.segundos_do_video(v))


def _lista(lista):
    return ListaSaida(id=lista.id, name=lista.nome, description=lista.descricao, tone=lista.tom,
                      videoIds=list(lista.video_ids), updatedAt=lista.atualizado_em)


def _executar(funcao, *args, **kwargs):
    """Traduz os erros do serviço para HTTP."""
    try:
        return funcao(*args, **kwargs)
    except servico.ItemDuplicado as erro:
        raise HTTPException(status_code=409, detail="Este vídeo já está na lista.") from erro
    except servico.ListaNaoEncontrada as erro:
        raise HTTPException(status_code=404, detail="Lista ou item não encontrado.") from erro
    except VideoNotFoundError as erro:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado.") from erro
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro


# --- Serviço de Busca ---

@router.get("/busca", response_model=list[VideoResultado])
def buscar(termo: str = Query(default="", max_length=200),
           categoria: str | None = Query(default=None, max_length=60),
           duracao: Literal["any", "short", "long"] = "any",
           ordem: Literal["featured", "title", "shortest"] = "featured",
           videos=Depends(get_videos)):
    return [_video(v) for v in _executar(servico.pesquisar, videos, termo, categoria, duracao, ordem)]


# --- Serviço de Listas ---

@router.get("/listas", response_model=list[ListaSaida])
def listar(usuario=Depends(usuario_atual), repo=Depends(get_repositorio)):
    return [_lista(lista) for lista in servico.listar(repo, usuario)]


@router.post("/listas", response_model=ListaSaida, status_code=201)
def criar(entrada: ListaEntrada, usuario=Depends(usuario_atual), repo=Depends(get_repositorio),
          agora=Depends(get_agora)):
    return _lista(_executar(servico.criar_lista, repo, usuario, entrada.name, entrada.description,
                            entrada.tone, agora))


@router.get("/listas/{lista_id}", response_model=ListaSaida)
def obter(lista_id: str, usuario=Depends(usuario_atual), repo=Depends(get_repositorio)):
    return _lista(_executar(servico.obter, repo, usuario, lista_id))


@router.patch("/listas/{lista_id}", response_model=ListaSaida)
def editar(lista_id: str, entrada: ListaEdicao, usuario=Depends(usuario_atual),
           repo=Depends(get_repositorio), agora=Depends(get_agora)):
    return _lista(_executar(servico.editar_lista, repo, usuario, lista_id, agora,
                            nome=entrada.name, descricao=entrada.description, tom=entrada.tone))


@router.delete("/listas/{lista_id}", status_code=204)
def apagar(lista_id: str, usuario=Depends(usuario_atual), repo=Depends(get_repositorio)):
    _executar(servico.apagar_lista, repo, usuario, lista_id)


@router.post("/listas/{lista_id}/itens", response_model=ListaSaida, status_code=201)
def adicionar_item(lista_id: str, entrada: ItemEntrada, usuario=Depends(usuario_atual),
                   repo=Depends(get_repositorio), videos=Depends(get_videos),
                   agora=Depends(get_agora)):
    return _lista(_executar(servico.adicionar_item, repo, videos, usuario, lista_id,
                            entrada.videoId, agora))


@router.delete("/listas/{lista_id}/itens/{video_id}", response_model=ListaSaida)
def remover_item(lista_id: str, video_id: str, usuario=Depends(usuario_atual),
                 repo=Depends(get_repositorio), agora=Depends(get_agora)):
    return _lista(_executar(servico.remover_item, repo, usuario, lista_id, video_id, agora))


@router.put("/videos/{video_id}/listas", response_model=list[ListaSaida])
def definir_listas_do_video(video_id: str, entrada: ListasDoVideo, usuario=Depends(usuario_atual),
                            repo=Depends(get_repositorio), videos=Depends(get_videos),
                            agora=Depends(get_agora)):
    listas = _executar(servico.definir_listas_do_video, repo, videos, usuario, video_id,
                       entrada.listIds, agora)
    return [_lista(lista) for lista in listas]
