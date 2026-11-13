"""Banco próprio ``choosen_busca_listas`` (seção 4.4 do modelo de dados).

- ``lista`` e ``item_lista``: listas pessoais de vídeos. A chave composta de
  ``item_lista`` implementa "um vídeo não entra duas vezes na mesma lista".
- ``indice_busca``: cópia local e reduzida de ``video_publico``, com o texto já
  normalizado, mantida pelas mensagens VideoPublicado/VideoAtualizado/VideoRemovido.
  Cada busca roda neste banco, sem chamada remota por consulta.

``usuario_id`` e ``item_lista.video_id`` são referências lógicas (sem FK).
O esquema vem das migrations de ``alembic_busca_listas/``.

Diferença em relação ao diagrama: a chave de ``lista`` é ``(usuario_id, id)``, e
não só ``id``. O front gera o id e as listas iniciais têm ids fixos
(``watch-later``...), iguais para todos os usuários.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import (
    Enum,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    delete,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.core.relogio import agora_utc
from app.db.base import UUID, DataHoraTZ
from app.mensageria.outbox import MensagemEnviadaMixin, MensagemRecebidaMixin

TONS = ("gold", "blue", "green", "purple")


class BaseBuscaListas(DeclarativeBase):
    pass


class ListaTabela(BaseBuscaListas):
    __tablename__ = "lista"

    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True)  # ref. lógica usuario_publico
    id: Mapped[str] = mapped_column(String(80), primary_key=True)  # gerado pelo front
    nome: Mapped[str] = mapped_column(String(60), nullable=False)
    descricao: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    tom: Mapped[str] = mapped_column(Enum(*TONS, name="tom_lista"), nullable=False, default="gold")
    criada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)
    atualizada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class ItemListaTabela(BaseBuscaListas):
    __tablename__ = "item_lista"
    __table_args__ = (
        ForeignKeyConstraint(["usuario_id", "lista_id"], ["lista.usuario_id", "lista.id"],
                             ondelete="CASCADE"),
    )

    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    lista_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    video_id: Mapped[str] = mapped_column(String(80), primary_key=True)  # ref. lógica video_publico
    posicao: Mapped[int] = mapped_column(Integer, nullable=False)
    adicionado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class IndiceBusca(BaseBuscaListas):
    __tablename__ = "indice_busca"

    video_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    texto_normalizado: Mapped[str] = mapped_column(Text, nullable=False)
    categoria: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    comunidade_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    duracao_segundos: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Também copiados de video_publico, para a busca responder sem chamada remota.
    autor: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    publicado_em: Mapped[datetime | None] = mapped_column(DataHoraTZ, nullable=True)
    atualizado_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class MensagemEnviada(MensagemEnviadaMixin, BaseBuscaListas):
    """Busca e Listas não publica mensagens; a tabela existe em todo banco próprio."""


class MensagemRecebida(MensagemRecebidaMixin, BaseBuscaListas):
    """Consome VideoPublicado, VideoAtualizado, VideoRemovido e UsuarioRemovido."""


# --- objetos devolvidos pelos repositórios ------------------------------------

@dataclass(frozen=True)
class Lista:
    id: str
    nome: str
    descricao: str
    tom: str
    video_ids: tuple[str, ...]
    atualizado_em: int  # epoch em ms, como no front


@dataclass(frozen=True)
class VideoIndexado:
    id: str
    title: str
    author: str
    category: str
    community_id: str | None
    image: str | None
    duration: int | None


def _para_ms(instante: datetime) -> int:
    return int(instante.timestamp() * 1000)


def _de_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, UTC)


class RepositorioSQL:
    """Listas de cada usuário (mesmo contrato usado por ``servico.py``)."""

    def __init__(self, fabrica: sessionmaker) -> None:
        self._sessao = fabrica

    def listas(self, usuario):
        with self._sessao() as s:
            linhas = s.scalars(select(ListaTabela).where(ListaTabela.usuario_id == usuario)).all()
            return [self._montar(s, linha) for linha in linhas]

    def lista(self, usuario, lista_id):
        with self._sessao() as s:
            linha = s.get(ListaTabela, (usuario, lista_id))
            return None if linha is None else self._montar(s, linha)

    def salvar_lista(self, usuario, lista):
        agora = agora_utc()
        with self._sessao.begin() as s:
            linha = s.get(ListaTabela, (usuario, lista.id))
            if linha is None:
                linha = ListaTabela(usuario_id=usuario, id=lista.id, criada_em=agora)
                s.add(linha)
            linha.nome = lista.nome
            linha.descricao = lista.descricao
            linha.tom = lista.tom
            linha.atualizada_em = _de_ms(lista.atualizado_em)
            itens = {i.video_id: i for i in s.scalars(select(ItemListaTabela).where(
                ItemListaTabela.usuario_id == usuario, ItemListaTabela.lista_id == lista.id))}
            for video_id, item in itens.items():
                if video_id not in lista.video_ids:
                    s.delete(item)
            s.flush()
            for posicao, video_id in enumerate(lista.video_ids):
                item = itens.get(video_id)
                if item is None:
                    s.add(ItemListaTabela(usuario_id=usuario, lista_id=lista.id, video_id=video_id,
                                          posicao=posicao, adicionado_em=agora))
                else:
                    item.posicao = posicao

    def apagar_lista(self, usuario, lista_id):
        with self._sessao.begin() as s:
            s.execute(delete(ItemListaTabela).where(ItemListaTabela.usuario_id == usuario,
                                                    ItemListaTabela.lista_id == lista_id))
            s.execute(delete(ListaTabela).where(ListaTabela.usuario_id == usuario,
                                                ListaTabela.id == lista_id))

    @staticmethod
    def _montar(s, linha):
        video_ids = s.scalars(
            select(ItemListaTabela.video_id)
            .where(ItemListaTabela.usuario_id == linha.usuario_id, ItemListaTabela.lista_id == linha.id)
            .order_by(ItemListaTabela.posicao)
        ).all()
        return Lista(linha.id, linha.nome, linha.descricao, linha.tom, tuple(video_ids),
                     _para_ms(linha.atualizada_em))


class RepositorioIndice:
    """Consultas ao ``indice_busca``."""

    def __init__(self, fabrica: sessionmaker) -> None:
        self._sessao = fabrica

    def buscar(self, termos: list[str], categoria: str | None) -> list[VideoIndexado]:
        """Vídeos cujo texto normalizado contém todos os termos, do mais recente ao mais antigo."""
        consulta = select(IndiceBusca)
        for termo in termos:
            consulta = consulta.where(IndiceBusca.texto_normalizado.contains(termo, autoescape=True))
        if categoria:
            consulta = consulta.where(IndiceBusca.categoria == categoria)
        consulta = consulta.order_by(IndiceBusca.publicado_em.desc(), IndiceBusca.video_id)
        with self._sessao() as s:
            return [self._montar(l) for l in s.scalars(consulta)]

    def existe(self, video_id: str) -> bool:
        with self._sessao() as s:
            return s.get(IndiceBusca, video_id) is not None

    @staticmethod
    def _montar(l: IndiceBusca) -> VideoIndexado:
        return VideoIndexado(l.video_id, l.titulo, l.autor, l.categoria, l.comunidade_id,
                             l.thumbnail_url, l.duracao_segundos)
