"""Banco próprio ``choosen_historico`` (seção 4.5 do modelo de dados).

``visualizacao`` (a visualização mais recente de cada vídeo por usuário) e
``preferencia_tempo``, mais ``mensagem_enviada`` e ``mensagem_recebida``. As duas
tabelas não se ligam por FK: são chaveadas pelo ``usuario_id``, referência lógica
a ``usuario_publico``. É alimentado pela mensagem ReproducaoRegistrada e também
pela rota ``POST /historico/visualizacoes`` do front. O esquema vem de
``alembic_historico/``.
"""

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime

from sqlalchemy import Boolean, Integer, String, delete, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.db.base import UUID, DataHoraTZ
from app.mensageria.outbox import MensagemEnviadaMixin, MensagemRecebidaMixin

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


class BaseHistorico(DeclarativeBase):
    pass


class VisualizacaoTabela(BaseHistorico):
    __tablename__ = "visualizacao"

    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True)  # ref. lógica usuario_publico
    video_id: Mapped[str] = mapped_column(String(80), primary_key=True)  # ref. lógica video_publico
    segundos_assistidos: Mapped[int] = mapped_column(Integer, nullable=False)
    assistido_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class PreferenciaTabela(BaseHistorico):
    __tablename__ = "preferencia_tempo"

    usuario_id: Mapped[str] = mapped_column(UUID, primary_key=True)  # ref. lógica usuario_publico
    limite_diario_minutos: Mapped[int] = mapped_column(Integer, nullable=False)
    lembrete_dormir: Mapped[bool] = mapped_column(Boolean, nullable=False)
    lembrete_tempo_tela: Mapped[bool] = mapped_column(Boolean, nullable=False)
    resumo_semanal: Mapped[bool] = mapped_column(Boolean, nullable=False)


class MensagemEnviada(MensagemEnviadaMixin, BaseHistorico):
    """Histórico não publica mensagens; a tabela existe em todo banco próprio."""


class MensagemRecebida(MensagemRecebidaMixin, BaseHistorico):
    """Consome ReproducaoRegistrada e UsuarioRemovido."""


def _para_ms(instante: datetime) -> int:
    return int(instante.timestamp() * 1000)


def _de_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, UTC)


# --- operações sobre uma sessão aberta -----------------------------------------

def _visualizacoes(s: Session, usuario):
    # Colunas, não entidades: salvar logo depois na mesma sessão não colide com o identity map.
    t = VisualizacaoTabela
    linhas = s.execute(select(t.video_id, t.segundos_assistidos, t.assistido_em)
                       .where(t.usuario_id == usuario).order_by(t.assistido_em.desc()))
    return [Visualizacao(video_id, segundos, _para_ms(em)) for video_id, segundos, em in linhas]


def _salvar_visualizacoes(s: Session, usuario, visualizacoes):
    s.execute(delete(VisualizacaoTabela).where(VisualizacaoTabela.usuario_id == usuario))
    s.add_all(VisualizacaoTabela(usuario_id=usuario, video_id=v.find_id, segundos_assistidos=v.segundos,
                                 assistido_em=_de_ms(v.assistido_em)) for v in visualizacoes)


def _limpar(s: Session, usuario):
    s.execute(delete(VisualizacaoTabela).where(VisualizacaoTabela.usuario_id == usuario))


def _preferencia(s: Session, usuario):
    p = s.get(PreferenciaTabela, usuario)
    if p is None:
        return PreferenciaTempo()
    return PreferenciaTempo(p.limite_diario_minutos, {"bedtime": p.lembrete_dormir,
                                                      "screenTime": p.lembrete_tempo_tela,
                                                      "weekly": p.resumo_semanal})


def _salvar_preferencia(s: Session, usuario, preferencia):
    l = preferencia.lembretes
    s.merge(PreferenciaTabela(usuario_id=usuario, limite_diario_minutos=preferencia.limite_diario,
                              lembrete_dormir=l["bedtime"], lembrete_tempo_tela=l["screenTime"],
                              resumo_semanal=l["weekly"]))


def apagar_usuario(s: Session, usuario):
    _limpar(s, usuario)
    s.execute(delete(PreferenciaTabela).where(PreferenciaTabela.usuario_id == usuario))


class RepositorioSQL:
    """Cada operação na sua própria transação (usado pelas rotas)."""

    def __init__(self, fabrica: sessionmaker):
        self._sessao = fabrica

    def visualizacoes(self, usuario):
        with self._sessao() as s:
            return _visualizacoes(s, usuario)

    def salvar_visualizacoes(self, usuario, visualizacoes):
        with self._sessao.begin() as s:
            _salvar_visualizacoes(s, usuario, visualizacoes)

    def limpar(self, usuario):
        with self._sessao.begin() as s:
            _limpar(s, usuario)

    def preferencia(self, usuario):
        with self._sessao() as s:
            return _preferencia(s, usuario)

    def salvar_preferencia(self, usuario, preferencia):
        with self._sessao.begin() as s:
            _salvar_preferencia(s, usuario, preferencia)


class RepositorioNaSessao:
    """Mesmo contrato, dentro de uma transação já aberta (usado pelo consumidor de mensagens)."""

    def __init__(self, sessao: Session):
        self._s = sessao

    def visualizacoes(self, usuario):
        return _visualizacoes(self._s, usuario)

    def salvar_visualizacoes(self, usuario, visualizacoes):
        _salvar_visualizacoes(self._s, usuario, visualizacoes)
        self._s.flush()

    def limpar(self, usuario):
        _limpar(self._s, usuario)

    def preferencia(self, usuario):
        return replace(_preferencia(self._s, usuario))

    def salvar_preferencia(self, usuario, preferencia):
        _salvar_preferencia(self._s, usuario, preferencia)
