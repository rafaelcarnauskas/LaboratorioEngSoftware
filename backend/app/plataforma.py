"""Montagem dos microserviços: bancos, mensagens e acesso ao banco compartilhado.

Cada microserviço recebe:

- o engine e a fábrica de sessões do **próprio banco** (só ele usa);
- um :class:`~app.mensageria.outbox.Outbox` ligado ao barramento da infraestrutura;
- um :class:`~app.infraestrutura.cliente.ClienteDadosCompartilhados` com o próprio
  id, para ler o banco compartilhado pela API (nunca a URL desse banco).

Só a infraestrutura (:class:`ServidorDadosCompartilhados` e
:class:`BarramentoMensagens`) tem o engine do banco compartilhado.

Usado por ``create_app()`` e pelos comandos ``python -m app.semear`` e
``python -m app.db.migrar``. Nenhuma tabela é criada aqui: o esquema vem das
migrations (``python -m app.db.migrar``).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.autenticacao import modelo as modelo_autenticacao
from app.autenticacao.mensagens import ligar_mensagens_de_usuarios
from app.busca_listas import modelo as modelo_busca
from app.busca_listas import servico as servico_busca
from app.comunidades import modelo as modelo_comunidades
from app.comunidades.servico import ServicoComunidades
from app.db.sessao import criar_engine, criar_session_local
from app.historico import modelo as modelo_historico
from app.historico import servico as servico_historico
from app.infraestrutura.barramento import BarramentoMensagens
from app.infraestrutura.cliente import (
    ClienteDadosCompartilhados,
    TransporteHTTP,
    TransporteLocal,
)
from app.infraestrutura.dados import ServidorDadosCompartilhados
from app.mensageria import (
    AUTENTICACAO,
    BUSCA_LISTAS,
    COMUNIDADES,
    HISTORICO,
    INFRAESTRUTURA,
    REPRODUCAO_REGISTRADA,
    USUARIO_REMOVIDO,
    VIDEO_ATUALIZADO,
    VIDEO_PUBLICADO,
    VIDEO_REMOVIDO,
    VIDEOS,
)
from app.mensageria.outbox import Outbox, consumidor
from app.videos import modelo as modelo_videos
from app.videos.servico import PlaybackService, VideoService

logger = logging.getLogger("choosen.plataforma")


@dataclass
class BuscaListas:
    repositorio: modelo_busca.RepositorioSQL
    indice: modelo_busca.RepositorioIndice
    videos: servico_busca.VerificadorVideos


@dataclass
class Historico:
    repositorio: modelo_historico.RepositorioSQL


@dataclass
class Plataforma:
    config: object
    engines: dict[str, Engine]
    fabricas: dict[str, sessionmaker]
    servidor_dados: ServidorDadosCompartilhados
    barramento: BarramentoMensagens
    outboxes: dict[str, Outbox] = field(default_factory=dict)
    clientes: dict[str, ClienteDadosCompartilhados] = field(default_factory=dict)
    comunidades: ServicoComunidades | None = None
    videos: VideoService | None = None
    reproducoes: PlaybackService | None = None
    busca_listas: BuscaListas | None = None
    historico: Historico | None = None

    def preparar(self) -> None:
        """Registra serviços/permissões e publica o que ficou pendente. Não lança."""
        try:
            self.servidor_dados.registrar_servicos(self.config.credenciais)
        except Exception as erro:  # noqa: BLE001
            logger.warning("Banco compartilhado sem esquema? Rode `python -m app.db.migrar` (%s).",
                           type(erro).__name__)
            return
        for servico_id, outbox in self.outboxes.items():
            try:
                outbox.publicar_pendentes()
            except Exception as erro:  # noqa: BLE001
                logger.warning("Outbox de %s indisponível (%s).", servico_id, type(erro).__name__)
        try:
            self.barramento.reprocessar()
        except Exception as erro:  # noqa: BLE001
            logger.warning("Não foi possível reprocessar entregas (%s).", type(erro).__name__)

    def fechar(self) -> None:
        for engine in self.engines.values():
            engine.dispose()


def montar_plataforma(config) -> Plataforma:
    engines = {servico: criar_engine(url) for servico, url in config.urls_bancos.items()}
    fabricas = {servico: criar_session_local(engine) for servico, engine in engines.items()
                if servico != INFRAESTRUTURA}

    servidor = ServidorDadosCompartilhados(engines[INFRAESTRUTURA])
    barramento = BarramentoMensagens(engines[INFRAESTRUTURA])
    barramento.registrar_consumidor(INFRAESTRUTURA, servidor.aplicar_mensagem)

    if config.infra_url:
        transporte = TransporteHTTP(config.infra_url, config.credenciais)
    else:
        transporte = TransporteLocal(servidor)

    p = Plataforma(config, engines, fabricas, servidor, barramento)

    modelos_outbox = {
        AUTENTICACAO: modelo_autenticacao.MensagemEnviada,
        COMUNIDADES: modelo_comunidades.MensagemEnviada,
        VIDEOS: modelo_videos.MensagemEnviada,
        BUSCA_LISTAS: modelo_busca.MensagemEnviada,
        HISTORICO: modelo_historico.MensagemEnviada,
    }
    for servico_id, modelo in modelos_outbox.items():
        outbox = Outbox(servico_id, fabricas[servico_id], modelo, barramento)
        outbox.ligar()
        p.outboxes[servico_id] = outbox
        p.clientes[servico_id] = ClienteDadosCompartilhados(servico_id, transporte)

    # Autenticação: mensagens de usuário gravadas na mesma transação.
    ligar_mensagens_de_usuarios(fabricas[AUTENTICACAO], p.outboxes[AUTENTICACAO])

    # Comunidades
    p.comunidades = ServicoComunidades(fabricas[COMUNIDADES], p.outboxes[COMUNIDADES])
    barramento.registrar_consumidor(COMUNIDADES, consumidor(
        fabricas[COMUNIDADES], modelo_comunidades.MensagemRecebida,
        {USUARIO_REMOVIDO: p.comunidades.ao_remover_usuario},
    ))

    # Vídeos
    p.videos = VideoService(fabricas[VIDEOS], p.outboxes[VIDEOS], p.clientes[VIDEOS])
    p.reproducoes = PlaybackService(p.videos)
    barramento.registrar_consumidor(VIDEOS, consumidor(
        fabricas[VIDEOS], modelo_videos.MensagemRecebida,
        {USUARIO_REMOVIDO: p.videos.ao_remover_usuario},
    ))

    # Busca e Listas
    indice = modelo_busca.RepositorioIndice(fabricas[BUSCA_LISTAS])
    p.busca_listas = BuscaListas(
        repositorio=modelo_busca.RepositorioSQL(fabricas[BUSCA_LISTAS]),
        indice=indice,
        videos=servico_busca.VerificadorVideos(indice, p.clientes[BUSCA_LISTAS]),
    )
    barramento.registrar_consumidor(BUSCA_LISTAS, consumidor(
        fabricas[BUSCA_LISTAS], modelo_busca.MensagemRecebida,
        {
            VIDEO_PUBLICADO: servico_busca.ao_publicar_video,
            VIDEO_ATUALIZADO: servico_busca.ao_publicar_video,
            VIDEO_REMOVIDO: servico_busca.ao_remover_video,
            USUARIO_REMOVIDO: servico_busca.ao_remover_usuario,
        },
    ))

    # Histórico
    p.historico = Historico(repositorio=modelo_historico.RepositorioSQL(fabricas[HISTORICO]))
    barramento.registrar_consumidor(HISTORICO, consumidor(
        fabricas[HISTORICO], modelo_historico.MensagemRecebida,
        {
            REPRODUCAO_REGISTRADA: servico_historico.ao_registrar_reproducao,
            USUARIO_REMOVIDO: servico_historico.ao_remover_usuario,
        },
    ))
    return p
