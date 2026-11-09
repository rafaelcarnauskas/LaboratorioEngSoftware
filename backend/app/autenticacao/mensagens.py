"""Comunicação via mensagem entre o banco próprio e o banco compartilhado.

Depois de cada ``commit`` que cria ou altera um Usuario no banco próprio, a
autenticação publica a mensagem ``usuario.perfil_publicado`` (envelope JSON com o
Perfil_Publico em ``dados``). O assinante registrado em :func:`montar_integracao`
grava essa cópia no banco compartilhado pela :class:`InterfaceDadosCompartilhados`.

A publicação vem de eventos do SQLAlchemy na fábrica de sessões da autenticação,
então cadastro, edição de perfil, troca e redefinição de senha e semeadura
publicam sem mudar ``servico.py``. A entrega acontece no fim da transação raiz,
depois que a conexão do banco próprio já voltou ao pool. Falha na entrega só gera
um WARNING no logger ``choosen.integracao`` (sem dados pessoais) e não muda a
resposta da API: o Usuario já está gravado no banco próprio. Com um banco
compartilhado separado em PostgreSQL, a conexão a ele espera no máximo
:data:`TIMEOUT_CONEXAO_COMPARTILHADO` segundos.

Usuários gravados antes desta integração (ou cuja entrega falhou) entram na
réplica com ``python -m app.autenticacao.republicar``.

O barramento roda no próprio processo. Um broker (RabbitMQ, Kafka) ou um outbox
pode substituí-lo sem mudar quem publica nem quem assina.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass
from uuid import uuid4

from sqlalchemy import event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, SessionTransaction, sessionmaker

from app.autenticacao.dados_compartilhados import (
    AcessoDadosCompartilhadosSQL,
    InterfaceDadosCompartilhados,
    InterfaceLeituraDadosCompartilhados,
    LeituraDadosCompartilhados,
)
from app.autenticacao.modelo import Usuario
from app.autenticacao.servico import para_perfil_publico
from app.core.relogio import agora_utc
from app.db.sessao import criar_engine

TIPO_PERFIL_PUBLICADO = "usuario.perfil_publicado"
ORIGEM = "autenticacao"
TIMEOUT_CONEXAO_COMPARTILHADO = 5  # segundos (connect_timeout do psycopg)

logger = logging.getLogger("choosen.integracao")

_CHAVE_PENDENTES = "autenticacao.perfis_pendentes"  # vistos no flush, ainda sem commit
_CHAVE_A_ENTREGAR = "autenticacao.perfis_a_entregar"  # já confirmados no banco próprio


@dataclass(frozen=True)
class Mensagem:
    """Envelope de uma mensagem; ``dados`` contém só tipos JSON."""

    id: str
    tipo: str
    origem: str
    emitida_em: str
    dados: dict

    @classmethod
    def nova(cls, tipo: str, dados: dict) -> Mensagem:
        emitida_em = agora_utc().isoformat().replace("+00:00", "Z")
        return cls(id=str(uuid4()), tipo=tipo, origem=ORIGEM, emitida_em=emitida_em, dados=dados)

    def para_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @classmethod
    def de_json(cls, texto: str) -> Mensagem:
        return cls(**json.loads(texto))


Tratador = Callable[[Mensagem], None]


class BarramentoMensagens:
    """Publicar/assinar por tipo de mensagem, dentro do processo."""

    def __init__(self) -> None:
        self._assinantes: dict[str, list[Tratador]] = {}

    def assinar(self, tipo: str, tratador: Tratador) -> None:
        self._assinantes.setdefault(tipo, []).append(tratador)

    def publicar(self, mensagem: Mensagem) -> bool:
        """Entrega a cada assinante uma cópia desserializada do JSON; nunca lança.

        Devolve ``False`` se alguma entrega falhou."""
        try:
            texto = mensagem.para_json()
        except Exception as erro:  # noqa: BLE001 - publicar nunca derruba quem publica
            logger.warning("Não foi possível entregar a mensagem %s (%s).",
                           mensagem.tipo, type(erro).__name__)
            return False
        entregue = True
        for tratador in self._assinantes.get(mensagem.tipo, []):
            try:
                tratador(Mensagem.de_json(texto))
            except Exception as erro:  # noqa: BLE001
                entregue = False
                logger.warning("Não foi possível entregar a mensagem %s (%s).",
                               mensagem.tipo, type(erro).__name__)
        return entregue


def ligar_publicacao_de_usuarios(fabrica: sessionmaker, barramento: BarramentoMensagens) -> None:
    """Publica ``usuario.perfil_publicado`` após cada ``commit`` que cria ou altera um Usuario."""

    def _apos_flush(session: Session, _contexto) -> None:
        try:
            pendentes = session.info.setdefault(_CHAVE_PENDENTES, {})
            for obj in (*session.new, *session.dirty):
                if isinstance(obj, Usuario):
                    pendentes[obj.id] = para_perfil_publico(obj).model_dump(mode="json")
        except Exception as erro:  # noqa: BLE001 - nunca quebrar o flush do banco próprio
            logger.warning("Não foi possível preparar a mensagem %s (%s).",
                           TIPO_PERFIL_PUBLICADO, type(erro).__name__)

    def _apos_commit(session: Session) -> None:
        # O after_commit roda antes de a conexão voltar ao pool: só marca para entregar.
        if session.in_nested_transaction():
            return  # SAVEPOINT: espera o commit da transação raiz
        pendentes = session.info.pop(_CHAVE_PENDENTES, None) or {}
        session.info.setdefault(_CHAVE_A_ENTREGAR, {}).update(pendentes)

    def _apos_rollback(session: Session, _transacao_anterior) -> None:
        session.info.pop(_CHAVE_PENDENTES, None)

    def _fim_da_transacao(session: Session, transacao: SessionTransaction) -> None:
        if transacao.parent is not None:
            return
        # Transação raiz encerrada e conexão do banco próprio já devolvida ao pool.
        session.info.pop(_CHAVE_PENDENTES, None)  # flush sem commit não vale
        a_entregar = session.info.pop(_CHAVE_A_ENTREGAR, None) or {}
        for dados in a_entregar.values():
            barramento.publicar(Mensagem.nova(TIPO_PERFIL_PUBLICADO, dados))

    event.listen(fabrica, "after_flush", _apos_flush)
    event.listen(fabrica, "after_commit", _apos_commit)
    event.listen(fabrica, "after_soft_rollback", _apos_rollback)
    event.listen(fabrica, "after_transaction_end", _fim_da_transacao)


@dataclass
class Integracao:
    barramento: BarramentoMensagens
    dados_compartilhados: InterfaceDadosCompartilhados  # leitura e escrita (só o assinante)
    leitura: InterfaceLeituraDadosCompartilhados  # o que as outras partes recebem
    engine_compartilhado: Engine
    engine_proprio: Engine

    def fechar(self) -> None:
        """Descarta o engine compartilhado, se ele não for o do banco próprio."""
        if self.engine_compartilhado is not self.engine_proprio:
            self.engine_compartilhado.dispose()


def _com_timeout_de_conexao(url: str) -> str:
    """Acrescenta ``connect_timeout`` à URL PostgreSQL que ainda não o define."""
    u = make_url(url)
    if u.get_backend_name() != "postgresql" or "connect_timeout" in u.query:
        return url
    u = u.update_query_dict({"connect_timeout": str(TIMEOUT_CONEXAO_COMPARTILHADO)})
    return u.render_as_string(hide_password=False)


def montar_integracao(config, engine_proprio: Engine) -> Integracao:
    """Cria a interface do banco compartilhado e o barramento com o assinante que a alimenta."""
    if config.url_compartilhada == config.database_url:
        engine_compartilhado = engine_proprio  # mesmo banco (inclusive sqlite:// em memória)
    else:
        engine_compartilhado = criar_engine(_com_timeout_de_conexao(config.url_compartilhada))
    dados = AcessoDadosCompartilhadosSQL(engine_compartilhado)
    barramento = BarramentoMensagens()
    barramento.assinar(TIPO_PERFIL_PUBLICADO, lambda m: dados.gravar_usuario_publico(m.dados))
    return Integracao(barramento, dados, LeituraDadosCompartilhados(dados),
                      engine_compartilhado, engine_proprio)
