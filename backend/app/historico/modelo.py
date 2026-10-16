from dataclasses import dataclass, field, replace

from sqlalchemy import BigInteger, Boolean, Integer, String, delete, select
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker

from app.db.base import Base

LEMBRETES = ("bedtime", "screenTime", "weekly")


@dataclass(frozen=True)
class Visualizacao:
    find_id: str
    segundos: int
    assistido_em: int  # epoch em ms, como no front


@dataclass(frozen=True)
class PreferenciaTempo:
    limite_diario: int = 60
    lembretes: dict = field(default_factory=lambda: {"bedtime": True, "screenTime": True, "weekly": False})


class VisualizacaoTabela(Base):
    __tablename__ = "historico_visualizacoes"
    usuario: Mapped[str] = mapped_column(String(255), primary_key=True)
    find_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    segundos: Mapped[int] = mapped_column(Integer)
    assistido_em: Mapped[int] = mapped_column(BigInteger)


class PreferenciaTabela(Base):
    __tablename__ = "historico_preferencias"
    usuario: Mapped[str] = mapped_column(String(255), primary_key=True)
    limite_diario: Mapped[int] = mapped_column(Integer)
    bedtime: Mapped[bool] = mapped_column(Boolean)
    screen_time: Mapped[bool] = mapped_column(Boolean)
    weekly: Mapped[bool] = mapped_column(Boolean)


class RepositorioSQL:
    def __init__(self, engine):
        Base.metadata.create_all(engine)  # até o Alembic entrar no Ciclo 3
        self._sessao = sessionmaker(engine)

    def visualizacoes(self, usuario):
        with self._sessao() as s:
            linhas = s.scalars(select(VisualizacaoTabela).where(VisualizacaoTabela.usuario == usuario)
                               .order_by(VisualizacaoTabela.assistido_em.desc()))
            return [Visualizacao(l.find_id, l.segundos, l.assistido_em) for l in linhas]

    def salvar_visualizacoes(self, usuario, visualizacoes):
        with self._sessao.begin() as s:
            s.execute(delete(VisualizacaoTabela).where(VisualizacaoTabela.usuario == usuario))
            s.add_all(VisualizacaoTabela(usuario=usuario, find_id=v.find_id, segundos=v.segundos,
                                         assistido_em=v.assistido_em) for v in visualizacoes)

    def limpar(self, usuario):
        with self._sessao.begin() as s:
            s.execute(delete(VisualizacaoTabela).where(VisualizacaoTabela.usuario == usuario))

    def preferencia(self, usuario):
        with self._sessao() as s:
            p = s.get(PreferenciaTabela, usuario)
            if p is None:
                return PreferenciaTempo()
            return PreferenciaTempo(p.limite_diario, {"bedtime": p.bedtime, "screenTime": p.screen_time,
                                                      "weekly": p.weekly})

    def salvar_preferencia(self, usuario, preferencia):
        l = preferencia.lembretes
        with self._sessao.begin() as s:
            s.merge(PreferenciaTabela(usuario=usuario, limite_diario=preferencia.limite_diario,
                                      bedtime=l["bedtime"], screen_time=l["screenTime"], weekly=l["weekly"]))


# Mesmo contrato do RepositorioSQL, sem banco: usado nos testes de regra.
class RepositorioMemoria:
    def __init__(self):
        self._visualizacoes = {}
        self._preferencias = {}

    def visualizacoes(self, usuario):
        return list(self._visualizacoes.get(usuario, []))

    def salvar_visualizacoes(self, usuario, visualizacoes):
        self._visualizacoes[usuario] = list(visualizacoes)

    def limpar(self, usuario):
        self._visualizacoes.pop(usuario, None)

    def preferencia(self, usuario):
        pref = self._preferencias.get(usuario, PreferenciaTempo())
        return replace(pref, lembretes=dict(pref.lembretes))

    def salvar_preferencia(self, usuario, preferencia):
        self._preferencias[usuario] = preferencia
