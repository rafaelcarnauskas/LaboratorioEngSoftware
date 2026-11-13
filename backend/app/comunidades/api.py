from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict

from app.autenticacao.api import PerfilPublico, obter_usuario_atual
from app.comunidades.modelo import Comunidade
from app.comunidades.servico import ComunidadeNaoEncontradaError, ServicoComunidades


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


def obter_servico(request: Request) -> ServicoComunidades:
    return request.app.state.plataforma.comunidades


def _nao_encontrada(error: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comunidade não encontrada.")


@router.get("", response_model=list[ComunidadeResposta])
def listar_comunidades(servico: ServicoComunidades = Depends(obter_servico)) -> list[Comunidade]:
    return servico.listar_comunidades()


@router.get("/{comunidade_id}", response_model=ComunidadeResposta)
def detalhar_comunidade(comunidade_id: str,
                        servico: ServicoComunidades = Depends(obter_servico)) -> Comunidade:
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
    servico: ServicoComunidades = Depends(obter_servico),
) -> ParticipacaoResposta:
    try:
        participou_agora = servico.participar(comunidade_id, usuario.id)
    except ComunidadeNaoEncontradaError as error:
        raise _nao_encontrada(error) from error

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


@router.delete("/{comunidade_id}/participar", response_model=ParticipacaoResposta)
def sair(
    comunidade_id: str,
    usuario: PerfilPublico = Depends(obter_usuario_atual),
    servico: ServicoComunidades = Depends(obter_servico),
) -> ParticipacaoResposta:
    try:
        saiu = servico.sair(comunidade_id, usuario.id)
    except ComunidadeNaoEncontradaError as error:
        raise _nao_encontrada(error) from error
    return ParticipacaoResposta(
        usuario_id=usuario.id,
        comunidade_id=comunidade_id,
        participou_agora=False,
        mensagem="Usuário saiu da comunidade." if saiu else "Usuário não participava da comunidade.",
    )
