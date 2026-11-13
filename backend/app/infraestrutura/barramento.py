"""Barramento de mensagens da infraestrutura.

:meth:`BarramentoMensagens.publicar` registra a mensagem na tabela ``mensagem`` e
cria uma ``entrega`` (``pendente``) para cada serviço que assina o tipo na tabela
``assinatura``. Em seguida entrega a cada assinante e marca ``entregue`` ou
``falhou`` (com ``tentativas``). :meth:`reprocessar` tenta de novo as entregas
que não saíram, por exemplo depois que um serviço volta ao ar.

Hoje os consumidores rodam no mesmo processo (cada serviço registra o seu com
:meth:`registrar_consumidor`). Um broker (RabbitMQ, Kafka) pode substituir a
entrega sem mudar as tabelas nem quem publica.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import case, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.core.relogio import agora_utc
from app.infraestrutura import catalogo
from app.infraestrutura.modelo import Assinatura, Entrega, MensagemRegistrada, Servico
from app.mensageria import INFRAESTRUTURA, Mensagem, instante_iso, ler_instante

logger = logging.getLogger("choosen.mensagens")

MAX_TENTATIVAS = 5
Consumidor = Callable[[Mensagem], None]


class OrigemRecusada(PermissionError):
    """O serviço não existe, está inativo ou não publica este tipo de mensagem."""


def _mensagem(linha: MensagemRegistrada) -> Mensagem:
    return Mensagem(str(linha.mensagem_id), linha.tipo, linha.servico_origem, linha.chave_entidade,
                    instante_iso(linha.criada_em), dict(linha.conteudo))


# A infraestrutura recebe primeiro: atualiza as tabelas compartilhadas antes dos serviços.
_ORDEM_DESTINO = case((Entrega.servico_destino == INFRAESTRUTURA, 0), else_=1)


class BarramentoMensagens:
    def __init__(self, engine: Engine) -> None:
        self._fabrica = sessionmaker(bind=engine)
        self._consumidores: dict[str, Consumidor] = {}

    def registrar_consumidor(self, servico_id: str, consumidor: Consumidor) -> None:
        self._consumidores[servico_id] = consumidor

    def publicar(self, mensagem: Mensagem) -> None:
        """Registra e entrega. Lança exceção só se não conseguir registrar."""
        with self._fabrica.begin() as sessao:
            origem = sessao.get(Servico, mensagem.servico_origem)
            if origem is None or not origem.ativo:
                raise OrigemRecusada(f"Serviço {mensagem.servico_origem} desconhecido ou inativo.")
            if catalogo.PUBLICADORES.get(mensagem.tipo) != mensagem.servico_origem:
                raise OrigemRecusada(f"{mensagem.servico_origem} não publica {mensagem.tipo}.")
            if sessao.get(MensagemRegistrada, mensagem.mensagem_id) is None:
                sessao.add(MensagemRegistrada(
                    mensagem_id=mensagem.mensagem_id,
                    tipo=mensagem.tipo,
                    servico_origem=mensagem.servico_origem,
                    chave_entidade=mensagem.chave_entidade,
                    conteudo=mensagem.conteudo,
                    criada_em=ler_instante(mensagem.criada_em),
                ))
                sessao.flush()
                destinos = sessao.scalars(
                    select(Assinatura.servico_id).where(Assinatura.tipo_mensagem == mensagem.tipo)
                ).all()
                sessao.add_all(Entrega(mensagem_id=mensagem.mensagem_id, servico_destino=d,
                                       status="pendente", tentativas=0) for d in destinos)
        self._entregar_pendentes(mensagem_id=mensagem.mensagem_id)

    def reprocessar(self) -> int:
        """Tenta de novo as entregas pendentes ou que falharam; devolve quantas saíram."""
        return self._entregar_pendentes()

    def _entregar_pendentes(self, mensagem_id: str | None = None) -> int:
        with self._fabrica() as sessao:
            consulta = (
                select(Entrega, MensagemRegistrada)
                .join(MensagemRegistrada, MensagemRegistrada.mensagem_id == Entrega.mensagem_id)
                .where(Entrega.status != "entregue", Entrega.tentativas < MAX_TENTATIVAS)
                .order_by(MensagemRegistrada.criada_em, _ORDEM_DESTINO, Entrega.servico_destino)
            )
            if mensagem_id is not None:
                consulta = consulta.where(Entrega.mensagem_id == mensagem_id)
            pendentes = [(e.servico_destino, _mensagem(m)) for e, m in sessao.execute(consulta)]
        # A sessão do banco compartilhado fecha antes de chamar os consumidores.
        return sum(self._entregar(destino, mensagem) for destino, mensagem in pendentes)

    def _entregar(self, destino: str, mensagem: Mensagem) -> bool:
        consumidor = self._consumidores.get(destino)
        entregue = False
        if consumidor is None:
            logger.warning("Nenhum consumidor de %s registrado neste processo.", destino)
        else:
            try:
                consumidor(mensagem)
                entregue = True
            except Exception as erro:  # noqa: BLE001 - a entrega fica como falhou
                logger.warning("Entrega de %s para %s falhou (%s: %s).", mensagem.tipo, destino,
                               type(erro).__name__, erro)
        with self._fabrica.begin() as sessao:
            entrega = sessao.get(Entrega, (mensagem.mensagem_id, destino))
            if entrega is not None and entrega.status != "entregue":
                entrega.tentativas += 1
                entrega.status = "entregue" if entregue else "falhou"
                entrega.entregue_em = agora_utc() if entregue else None
        return entregue
