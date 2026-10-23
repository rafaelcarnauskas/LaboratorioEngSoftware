# Rotas do Serviço de Histórico e do Serviço de Tempo de Uso.
# Os campos JSON seguem os nomes do front (findId, seconds, watchedAt...).
import time
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.autenticacao.api import PerfilPublico, obter_usuario_atual
from app.db.base import criar_engine

from . import modelo, servico

router = APIRouter(prefix="/api/v1", tags=["historico"])


@lru_cache
def get_repositorio():
    return modelo.RepositorioSQL(criar_engine())


def get_agora():
    return int(time.time() * 1000)


def usuario_atual(usuario: PerfilPublico = Depends(obter_usuario_atual)) -> str:
    return usuario.id


class VisualizacaoEntrada(BaseModel):
    findId: str = Field(min_length=1)
    seconds: int = Field(gt=0, le=servico.MAX_SEGUNDOS)
    watchedAt: int | None = Field(default=None, gt=0)


class VisualizacaoSaida(BaseModel):
    findId: str
    seconds: int
    watchedAt: int


class GrupoHistorico(BaseModel):
    label: str
    items: list[VisualizacaoSaida]


class DiaUso(BaseModel):
    day: str
    dayKey: str
    minutes: int
    current: bool


class ResumoTempo(BaseModel):
    todayMinutes: int
    weekUsage: list[DiaUso]
    averageMinutes: int
    balancedDays: int
    dailyLimit: int
    rawPercentage: int
    clampedPercentage: int
    remainingMinutes: int
    isOverLimit: bool
    status: str


class Lembretes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bedtime: bool
    screenTime: bool
    weekly: bool


class Preferencias(BaseModel):
    dailyLimit: Literal[30, 45, 60, 90, 120]
    reminders: Lembretes


def _saida(v):
    return VisualizacaoSaida(findId=v.find_id, seconds=v.segundos, watchedAt=v.assistido_em)


@router.post("/historico/visualizacoes", response_model=VisualizacaoSaida, status_code=201)
def registrar(entrada: VisualizacaoEntrada, usuario=Depends(usuario_atual),
              repo=Depends(get_repositorio), agora=Depends(get_agora)):
    v = servico.registrar_visualizacao(repo, usuario, entrada.findId, entrada.seconds,
                                       entrada.watchedAt or agora)
    return _saida(v)


@router.get("/historico", response_model=list[GrupoHistorico])
def listar(usuario=Depends(usuario_atual), repo=Depends(get_repositorio), agora=Depends(get_agora)):
    return [GrupoHistorico(label=g["label"], items=[_saida(v) for v in g["items"]])
            for g in servico.historico(repo, usuario, agora)]


@router.get("/historico/recentes", response_model=list[VisualizacaoSaida])
def listar_recentes(limite: int = Query(default=4, ge=1, le=servico.MAX_VISUALIZACOES),
                    usuario=Depends(usuario_atual), repo=Depends(get_repositorio)):
    return [_saida(v) for v in servico.recentes(repo, usuario, limite)]


@router.delete("/historico", status_code=204)
def limpar(usuario=Depends(usuario_atual), repo=Depends(get_repositorio)):
    servico.limpar_historico(repo, usuario)


@router.get("/tempo/resumo", response_model=ResumoTempo)
def resumo(usuario=Depends(usuario_atual), repo=Depends(get_repositorio), agora=Depends(get_agora)):
    return servico.resumo_tempo(repo, usuario, agora)


@router.get("/tempo/preferencias", response_model=Preferencias)
def ler_preferencias(usuario=Depends(usuario_atual), repo=Depends(get_repositorio)):
    pref = repo.preferencia(usuario)
    return Preferencias(dailyLimit=pref.limite_diario, reminders=Lembretes(**pref.lembretes))


@router.put("/tempo/preferencias", response_model=Preferencias)
def salvar_preferencias(entrada: Preferencias, usuario=Depends(usuario_atual),
                        repo=Depends(get_repositorio)):
    pref = servico.atualizar_preferencias(repo, usuario, entrada.dailyLimit,
                                          entrada.reminders.model_dump())
    return Preferencias(dailyLimit=pref.limite_diario, reminders=Lembretes(**pref.lembretes))
