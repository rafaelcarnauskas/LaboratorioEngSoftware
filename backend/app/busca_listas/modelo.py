# Entidades Lista e Item da Lista (exclusivas da parte 4) e seus repositórios.
# Vídeo (parte 3) e Usuário (parte 1) só são referenciados pelo id.
from dataclasses import dataclass, replace

from sqlalchemy import BigInteger, ForeignKeyConstraint, Integer, String, delete, select
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker

from app.db.base import Base, criar_tabelas


@dataclass(frozen=True)
class Lista:
    id: str
    nome: str
    descricao: str
    tom: str
    video_ids: tuple[str, ...]
    atualizado_em: int  # epoch em ms


class ListaTabela(Base):
    __tablename__ = "listas"
    usuario: Mapped[str] = mapped_column(String(255), primary_key=True)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    nome: Mapped[str] = mapped_column(String(60))
    descricao: Mapped[str] = mapped_column(String(180))
    tom: Mapped[str] = mapped_column(String(20))
    atualizado_em: Mapped[int] = mapped_column(BigInteger)


class ItemListaTabela(Base):
    # A chave primária (usuario, lista_id, video_id) impede item duplicado.
    __tablename__ = "itens_lista"
    __table_args__ = (
        ForeignKeyConstraint(
            ["usuario", "lista_id"], ["listas.usuario", "listas.id"], ondelete="CASCADE",
        ),
    )
    usuario: Mapped[str] = mapped_column(String(255), primary_key=True)
    lista_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    video_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    posicao: Mapped[int] = mapped_column(Integer)


class RepositorioSQL:
    def __init__(self, engine):
        criar_tabelas(engine)  # até o Alembic entrar no Ciclo 3
        self._sessao = sessionmaker(engine)

    def listas(self, usuario):
        with self._sessao() as s:
            linhas = s.scalars(select(ListaTabela).where(ListaTabela.usuario == usuario)).all()
            return [self._montar(s, usuario, linha) for linha in linhas]

    def lista(self, usuario, lista_id):
        with self._sessao() as s:
            linha = s.get(ListaTabela, (usuario, lista_id))
            return None if linha is None else self._montar(s, usuario, linha)

    def salvar_lista(self, usuario, lista):
        with self._sessao.begin() as s:
            s.merge(ListaTabela(usuario=usuario, id=lista.id, nome=lista.nome,
                                descricao=lista.descricao, tom=lista.tom,
                                atualizado_em=lista.atualizado_em))
            s.execute(delete(ItemListaTabela).where(ItemListaTabela.usuario == usuario,
                                                    ItemListaTabela.lista_id == lista.id))
            s.add_all(ItemListaTabela(usuario=usuario, lista_id=lista.id, video_id=v, posicao=i)
                      for i, v in enumerate(lista.video_ids))

    def apagar_lista(self, usuario, lista_id):
        with self._sessao.begin() as s:
            s.execute(delete(ItemListaTabela).where(ItemListaTabela.usuario == usuario,
                                                    ItemListaTabela.lista_id == lista_id))
            s.execute(delete(ListaTabela).where(ListaTabela.usuario == usuario,
                                                ListaTabela.id == lista_id))

    @staticmethod
    def _montar(s, usuario, linha):
        video_ids = s.scalars(
            select(ItemListaTabela.video_id)
            .where(ItemListaTabela.usuario == usuario, ItemListaTabela.lista_id == linha.id)
            .order_by(ItemListaTabela.posicao)
        ).all()
        return Lista(linha.id, linha.nome, linha.descricao, linha.tom, tuple(video_ids),
                     linha.atualizado_em)


class RepositorioMemoria:
    def __init__(self):
        self._listas = {}

    def listas(self, usuario):
        return list(self._listas.get(usuario, {}).values())

    def lista(self, usuario, lista_id):
        return self._listas.get(usuario, {}).get(lista_id)

    def salvar_lista(self, usuario, lista):
        self._listas.setdefault(usuario, {})[lista.id] = replace(lista)

    def apagar_lista(self, usuario, lista_id):
        self._listas.get(usuario, {}).pop(lista_id, None)
