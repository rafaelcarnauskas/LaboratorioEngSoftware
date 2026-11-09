from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.autenticacao.api import PerfilPublico, obter_usuario_atual
from app.comunidades.modelo import Comunidade
from app.comunidades.servico import (
    ComunidadeNaoEncontradaError,
    ServicoComunidades,
    UsuarioNaoEncontradoError,
)


class NichoResposta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nome: str


class ComunidadeResumoResposta(BaseModel):
    id: str
    nome: str
    descricao: str
    quantidade_membros: int


class ComunidadeResposta(ComunidadeResumoResposta):
    nichos: list[NichoResposta]


class ParticipacaoRequisicao(BaseModel):
    usuario_id: str


class ParticipacaoResposta(BaseModel):
    usuario_id: str
    comunidade_id: str
    participou_agora: bool
    mensagem: str


router = APIRouter(prefix="/comunidades", tags=["comunidades"])
servico = ServicoComunidades()


@router.get("", response_model=list[ComunidadeResumoResposta])
def listar_comunidades() -> list[Comunidade]:
    return servico.listar_comunidades()


@router.get("/{comunidade_id}", response_model=ComunidadeResposta)
def detalhar_comunidade(comunidade_id: str) -> Comunidade:
    try:
        return servico.buscar_comunidade(comunidade_id)
    except ComunidadeNaoEncontradaError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comunidade não encontrada.",
        ) from error


@router.post(
    "/{comunidade_id}/participar",
    response_model=ParticipacaoResposta,
)
def participar(
    comunidade_id: str,
    # Mantém aceitação do corpo enviado por versões anteriores do frontend;
    # a identidade usada sempre vem do token, nunca do id recebido no corpo.
    requisicao: ParticipacaoRequisicao | None = None,
    usuario: PerfilPublico = Depends(obter_usuario_atual),
) -> ParticipacaoResposta:
    try:
        servico.registrar_usuario(usuario.id, usuario.name, usuario.email)
        participou_agora = servico.participar(comunidade_id, usuario.id)
    except ComunidadeNaoEncontradaError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comunidade não encontrada.",
        ) from error
    except UsuarioNaoEncontradoError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        ) from error

    mensagem = (
        "Usuário entrou na comunidade."
        if participou_agora
        else "Usuário já participa da comunidade."
    )
    return ParticipacaoResposta(
        usuario_id=usuario.id,
        comunidade_id=comunidade_id,
        participou_agora=participou_agora,
        mensagem=mensagem,
    )
