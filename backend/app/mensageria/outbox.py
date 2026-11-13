"""Tabelas técnicas que todo banco próprio tem: ``mensagem_enviada`` e ``mensagem_recebida``.

- ``mensagem_enviada`` (padrão *outbox*): o serviço grava a mensagem na mesma
  transação da mudança. Depois do ``commit``, :class:`Outbox` a entrega ao
  barramento da infraestrutura e marca ``publicada_em``. Se o barramento estiver
  fora do ar, a linha continua pendente e sai na próxima publicação.
- ``mensagem_recebida``: ids das mensagens já processadas. :func:`consumidor`
  aplica o efeito e grava o id na mesma transação, então a mesma mensagem
  entregue duas vezes só tem efeito uma vez.

Cada serviço declara as duas classes com o próprio ``DeclarativeBase``::

    class MensagemEnviada(MensagemEnviadaMixin, BaseComunidades): pass
    class MensagemRecebida(MensagemRecebidaMixin, BaseComunidades): pass
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from sqlalchemy import String, event, select
from sqlalchemy.orm import Mapped, Session, SessionTransaction, mapped_column, sessionmaker

from app.core.relogio import agora_utc
from app.db.base import JSONB, UUID, DataHoraTZ
from app.mensageria import Mensagem, instante_iso

logger = logging.getLogger("choosen.mensagens")

_CHAVE_REGISTRADA = "outbox.registrada"  # mensagem adicionada na transação atual
_CHAVE_PUBLICAR = "outbox.publicar"  # commit feito; publicar no fim da transação raiz
LOTE_PUBLICACAO = 100


class MensagemEnviadaMixin:
    __tablename__ = "mensagem_enviada"

    mensagem_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    chave_entidade: Mapped[str] = mapped_column(String(255), nullable=False)
    conteudo: Mapped[dict] = mapped_column(JSONB, nullable=False)
    criada_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)
    publicada_em: Mapped[datetime | None] = mapped_column(DataHoraTZ, nullable=True)


class MensagemRecebidaMixin:
    __tablename__ = "mensagem_recebida"

    mensagem_id: Mapped[str] = mapped_column(UUID, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    servico_origem: Mapped[str] = mapped_column(String(40), nullable=False)
    recebida_em: Mapped[datetime] = mapped_column(DataHoraTZ, nullable=False)


class Barramento(Protocol):
    def publicar(self, mensagem: Mensagem) -> None: ...


class Outbox:
    """Grava as mensagens de um serviço no banco próprio e as publica depois do commit."""

    def __init__(self, servico_id: str, fabrica: sessionmaker, modelo, barramento: Barramento) -> None:
        self.servico_id = servico_id
        self._fabrica = fabrica
        self._modelo = modelo
        self._barramento = barramento
        self._trava = threading.RLock()

    def registrar(self, sessao: Session, tipo: str, chave_entidade: str, conteudo: dict) -> Mensagem:
        """Acrescenta a mensagem à transação de ``sessao`` (sem ``commit``)."""
        mensagem = Mensagem.nova(tipo, self.servico_id, chave_entidade, conteudo)
        sessao.add(self._modelo(
            mensagem_id=mensagem.mensagem_id,
            tipo=mensagem.tipo,
            chave_entidade=mensagem.chave_entidade,
            conteudo=mensagem.conteudo,
            criada_em=agora_utc(),
        ))
        sessao.info[_CHAVE_REGISTRADA] = True
        return mensagem

    def publicar_pendentes(self) -> int:
        """Entrega ao barramento, em ordem, as mensagens ainda não publicadas.

        Para na primeira falha (a ordem importa) e devolve quantas saíram."""
        publicadas = 0
        with self._trava:
            while True:
                pendentes = self._proximo_lote()
                if not pendentes:
                    return publicadas
                for mensagem in pendentes:
                    try:
                        self._barramento.publicar(mensagem)
                    except Exception as erro:  # noqa: BLE001 - a mensagem fica pendente
                        logger.warning("Mensagem %s de %s não publicada (%s); fica pendente.",
                                       mensagem.tipo, self.servico_id, type(erro).__name__)
                        return publicadas
                    with self._fabrica.begin() as sessao:
                        linha = sessao.get(self._modelo, mensagem.mensagem_id)
                        if linha is not None and linha.publicada_em is None:
                            linha.publicada_em = agora_utc()
                    publicadas += 1

    def _proximo_lote(self) -> list[Mensagem]:
        with self._fabrica() as sessao:
            linhas = sessao.scalars(
                select(self._modelo)
                .where(self._modelo.publicada_em.is_(None))
                .order_by(self._modelo.criada_em)
                .limit(LOTE_PUBLICACAO)
            ).all()
            return [
                Mensagem(str(l.mensagem_id), l.tipo, self.servico_id, l.chave_entidade,
                         instante_iso(l.criada_em), dict(l.conteudo))
                for l in linhas
            ]

    def ligar(self) -> None:
        """Publica automaticamente no fim de toda transação raiz que gravou mensagens."""

        def _apos_commit(sessao: Session) -> None:
            if sessao.in_nested_transaction():
                return
            if sessao.info.pop(_CHAVE_REGISTRADA, False):
                sessao.info[_CHAVE_PUBLICAR] = True

        def _apos_rollback(sessao: Session, _anterior) -> None:
            sessao.info.pop(_CHAVE_REGISTRADA, None)

        def _fim(sessao: Session, transacao: SessionTransaction) -> None:
            if transacao.parent is not None:
                return
            if sessao.info.pop(_CHAVE_PUBLICAR, False):
                self.publicar_pendentes()

        event.listen(self._fabrica, "after_commit", _apos_commit)
        event.listen(self._fabrica, "after_soft_rollback", _apos_rollback)
        event.listen(self._fabrica, "after_transaction_end", _fim)


def consumidor(fabrica: sessionmaker, modelo_recebida,
               tratadores: dict[str, Callable[[Session, Mensagem], None]]) -> Callable[[Mensagem], None]:
    """Monta o consumidor de um serviço: idempotente e numa transação só.

    ``tratadores`` liga cada tipo de mensagem a uma função ``(sessao, mensagem)``
    que aplica o efeito no banco próprio sem fazer ``commit``."""

    def consumir(mensagem: Mensagem) -> None:
        tratador = tratadores.get(mensagem.tipo)
        if tratador is None:
            return
        with fabrica.begin() as sessao:
            if sessao.get(modelo_recebida, mensagem.mensagem_id) is not None:
                return
            tratador(sessao, mensagem)
            sessao.add(modelo_recebida(
                mensagem_id=mensagem.mensagem_id,
                tipo=mensagem.tipo,
                servico_origem=mensagem.servico_origem,
                recebida_em=agora_utc(),
            ))

    return consumir
