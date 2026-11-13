"""Regras do serviço de Comunidades sobre o banco próprio ``choosen_comunidades``.

``quantidade_membros`` é derivado: conta as linhas de ``participacao``. Cada
entrada ou saída publica MembroEntrou/MembroSaiu com a nova contagem, que a
infraestrutura grava em ``comunidade_publica``.
"""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.comunidades.modelo import Comunidade, ComunidadeTabela, Nicho, NichoTabela, Participacao
from app.core.relogio import agora_utc
from app.mensageria import (
    COMUNIDADE_ATUALIZADA,
    COMUNIDADE_CRIADA,
    MEMBRO_ENTROU,
    MEMBRO_SAIU,
    Mensagem,
    instante_iso,
)
from app.mensageria.outbox import Outbox


class ComunidadeNaoEncontradaError(LookupError):
    """Indica que a comunidade solicitada não existe."""


def _quantidade_membros(sessao: Session, comunidade_id: str) -> int:
    return sessao.scalar(
        select(func.count()).select_from(Participacao).where(Participacao.comunidade_id == comunidade_id)
    ) or 0


def _nichos(sessao: Session, comunidade_id: str) -> list[NichoTabela]:
    return list(sessao.scalars(
        select(NichoTabela).where(NichoTabela.comunidade_id == comunidade_id).order_by(NichoTabela.nome)
    ))


def _montar(sessao: Session, linha: ComunidadeTabela) -> Comunidade:
    return Comunidade(
        id=linha.id,
        nome=linha.nome,
        descricao=linha.descricao,
        quantidade_membros=_quantidade_membros(sessao, linha.id),
        nichos=tuple(Nicho(n.id, n.nome) for n in _nichos(sessao, linha.id)),
    )


def conteudo_comunidade(sessao: Session, linha: ComunidadeTabela) -> dict:
    return {
        "comunidade_id": linha.id,
        "nome": linha.nome,
        "descricao": linha.descricao,
        "quantidade_membros": _quantidade_membros(sessao, linha.id),
        "atualizado_em": instante_iso(agora_utc()),
        "nichos": [{"nicho_id": n.id, "nome": n.nome} for n in _nichos(sessao, linha.id)],
    }


class ServicoComunidades:
    def __init__(self, fabrica: sessionmaker, outbox: Outbox) -> None:
        self._fabrica = fabrica
        self._outbox = outbox

    def listar_comunidades(self) -> list[Comunidade]:
        with self._fabrica() as sessao:
            linhas = sessao.scalars(select(ComunidadeTabela).order_by(ComunidadeTabela.criada_em,
                                                                      ComunidadeTabela.id))
            return [_montar(sessao, linha) for linha in linhas]

    def buscar_comunidade(self, comunidade_id: str) -> Comunidade:
        with self._fabrica() as sessao:
            linha = sessao.get(ComunidadeTabela, comunidade_id)
            if linha is None:
                raise ComunidadeNaoEncontradaError(comunidade_id)
            return _montar(sessao, linha)

    def salvar_comunidade(self, comunidade_id: str, nome: str, descricao: str,
                          nichos: list[tuple[str, str]], criada_por: str | None = None) -> Comunidade:
        """Cria ou atualiza a comunidade e seus nichos; publica ComunidadeCriada/Atualizada."""
        with self._fabrica.begin() as sessao:
            linha = sessao.get(ComunidadeTabela, comunidade_id)
            criada = linha is None
            if criada:
                linha = ComunidadeTabela(id=comunidade_id, criada_por=criada_por, criada_em=agora_utc())
                sessao.add(linha)
            linha.nome = nome
            linha.descricao = descricao
            ids = [nicho_id for nicho_id, _ in nichos]
            sessao.execute(delete(NichoTabela).where(NichoTabela.comunidade_id == comunidade_id,
                                                     NichoTabela.id.not_in(ids or [""])))
            for nicho_id, nome_nicho in nichos:
                sessao.merge(NichoTabela(id=nicho_id, comunidade_id=comunidade_id, nome=nome_nicho))
            sessao.flush()
            tipo = COMUNIDADE_CRIADA if criada else COMUNIDADE_ATUALIZADA
            self._outbox.registrar(sessao, tipo, comunidade_id, conteudo_comunidade(sessao, linha))
        return self.buscar_comunidade(comunidade_id)

    def participar(self, comunidade_id: str, usuario_id: str) -> bool:
        with self._fabrica.begin() as sessao:
            if sessao.get(ComunidadeTabela, comunidade_id) is None:
                raise ComunidadeNaoEncontradaError(comunidade_id)
            if sessao.get(Participacao, (comunidade_id, usuario_id)) is not None:
                return False
            sessao.add(Participacao(comunidade_id=comunidade_id, usuario_id=usuario_id,
                                    papel="membro", entrou_em=agora_utc()))
            sessao.flush()
            self._registrar_membros(sessao, MEMBRO_ENTROU, comunidade_id, usuario_id)
            return True

    def sair(self, comunidade_id: str, usuario_id: str) -> bool:
        with self._fabrica.begin() as sessao:
            if sessao.get(ComunidadeTabela, comunidade_id) is None:
                raise ComunidadeNaoEncontradaError(comunidade_id)
            participacao = sessao.get(Participacao, (comunidade_id, usuario_id))
            if participacao is None:
                return False
            sessao.delete(participacao)
            sessao.flush()
            self._registrar_membros(sessao, MEMBRO_SAIU, comunidade_id, usuario_id)
            return True

    def usuario_participa(self, comunidade_id: str, usuario_id: str) -> bool:
        with self._fabrica() as sessao:
            if sessao.get(ComunidadeTabela, comunidade_id) is None:
                raise ComunidadeNaoEncontradaError(comunidade_id)
            return sessao.get(Participacao, (comunidade_id, usuario_id)) is not None

    def _registrar_membros(self, sessao: Session, tipo: str, comunidade_id: str, usuario_id: str) -> None:
        self._outbox.registrar(sessao, tipo, comunidade_id, {
            "comunidade_id": comunidade_id,
            "usuario_id": usuario_id,
            "quantidade_membros": _quantidade_membros(sessao, comunidade_id),
            "atualizado_em": instante_iso(agora_utc()),
        })

    # --- consumidor ----------------------------------------------------------------

    def ao_remover_usuario(self, sessao: Session, mensagem: Mensagem) -> None:
        """UsuarioRemovido: apaga as participações e publica a nova contagem."""
        usuario_id = mensagem.conteudo["usuario_id"]
        comunidades = sessao.scalars(
            select(Participacao.comunidade_id).where(Participacao.usuario_id == usuario_id)
        ).all()
        sessao.execute(delete(Participacao).where(Participacao.usuario_id == usuario_id))
        sessao.flush()
        for comunidade_id in comunidades:
            self._registrar_membros(sessao, MEMBRO_SAIU, comunidade_id, usuario_id)
