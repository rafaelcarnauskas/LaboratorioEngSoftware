"""Carga inicial (e reparo) de ``usuario_publico`` no banco compartilhado.

Uso, em ``backend/``, depois de ``python -m app.db.migrar``::

    python -m app.autenticacao.republicar

Grava no outbox da autenticação uma mensagem PerfilAtualizado para cada Usuario
e as publica pelo barramento. Serve para os usuários gravados antes da
integração. Pode rodar mais de uma vez: a infraestrutura ignora mensagem mais
velha que a linha atual. Não altera a tabela ``usuario``.

Código de saída 0 quando todas as mensagens foram publicadas e 1 caso contrário,
com a mensagem de erro em ``stderr``.
"""

from __future__ import annotations

import sys

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.autenticacao.mensagens import conteudo_usuario
from app.autenticacao.modelo import MensagemEnviada, Usuario
from app.autenticacao.semear import MSG_ESQUEMA_AUSENTE, _esquema_pronto
from app.core.config import carregar_configuracao
from app.mensageria import AUTENTICACAO, PERFIL_ATUALIZADO
from app.plataforma import montar_plataforma

MSG_PUBLICADOS = "{total} perfis publicados no banco compartilhado."
MSG_FALHAS = (
    "{falhas} de {total} mensagens continuam pendentes (veja os avisos de "
    "choosen.mensagens). Confira CHOOSEN_SHARED_DATABASE_URL e se "
    "`python -m app.db.migrar` já rodou."
)


def _erro(mensagem: str) -> int:
    print(mensagem, file=sys.stderr)
    return 1


def main() -> int:
    """Republica todos os perfis; devolve o código de saída do processo."""
    try:
        config = carregar_configuracao()
    except SystemExit as erro:
        return _erro(str(erro.code))

    plataforma = montar_plataforma(config)
    try:
        try:
            if not _esquema_pronto(plataforma.engines[AUTENTICACAO]):
                return _erro(MSG_ESQUEMA_AUSENTE)
            plataforma.preparar()
            outbox = plataforma.outboxes[AUTENTICACAO]
            with plataforma.fabricas[AUTENTICACAO].begin() as db:
                usuarios = list(db.scalars(select(Usuario).order_by(Usuario.criado_em)))
                for usuario in usuarios:
                    outbox.registrar(db, PERFIL_ATUALIZADO, usuario.id, conteudo_usuario(usuario))
            with plataforma.fabricas[AUTENTICACAO]() as db:
                pendentes = len(db.scalars(
                    select(MensagemEnviada.mensagem_id).where(MensagemEnviada.publicada_em.is_(None))
                ).all())
        except SQLAlchemyError as erro:
            return _erro(f"Não foi possível ler o banco próprio: {erro.__class__.__name__}.")
        if pendentes:
            return _erro(MSG_FALHAS.format(falhas=pendentes, total=len(usuarios)))
        print(MSG_PUBLICADOS.format(total=len(usuarios)))
        return 0
    finally:
        plataforma.fechar()


if __name__ == "__main__":
    sys.exit(main())
