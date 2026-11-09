"""Carga inicial (e reparo) da réplica ``usuario_publico`` no banco compartilhado.

Uso, em ``backend/``, depois de ``alembic upgrade head`` e
``alembic -n compartilhado upgrade head``::

    python -m app.autenticacao.republicar

Publica a mensagem ``usuario.perfil_publicado`` para cada Usuario do banco
próprio, pelo mesmo barramento usado pela API. Serve para os usuários gravados
antes da integração e para os que ficaram desatualizados depois de um WARNING em
``choosen.integracao``. Pode rodar mais de uma vez: a réplica não volta para um
estado mais antigo. Não altera o banco próprio.

Código de saída 0 quando todas as entregas deram certo e 1 caso contrário, com a
mensagem de erro em ``stderr``.
"""

from __future__ import annotations

import sys

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.autenticacao.mensagens import TIPO_PERFIL_PUBLICADO, Mensagem, montar_integracao
from app.autenticacao.modelo import Usuario
from app.autenticacao.semear import MSG_ESQUEMA_AUSENTE, _esquema_pronto
from app.autenticacao.servico import para_perfil_publico
from app.core.config import carregar_configuracao
from app.db.sessao import criar_engine, criar_session_local

MSG_PUBLICADOS = "{total} perfis publicados no banco compartilhado."
MSG_FALHAS = (
    "{falhas} de {total} perfis não chegaram ao banco compartilhado (veja os avisos "
    "de choosen.integracao). Confira CHOOSEN_SHARED_DATABASE_URL e se "
    "`alembic -n compartilhado upgrade head` já rodou."
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

    engine = criar_engine(config.database_url)
    integracao = None
    try:
        try:
            if not _esquema_pronto(engine):
                return _erro(MSG_ESQUEMA_AUSENTE)
            # Lê tudo antes de publicar: a sessão do banco próprio fecha antes da entrega.
            with criar_session_local(engine)() as db:
                perfis = [
                    para_perfil_publico(u).model_dump(mode="json")
                    for u in db.scalars(select(Usuario).order_by(Usuario.criado_em))
                ]
        except SQLAlchemyError as erro:
            return _erro(f"Não foi possível ler o banco próprio: {erro.__class__.__name__}.")

        integracao = montar_integracao(config, engine)
        falhas = sum(
            not integracao.barramento.publicar(Mensagem.nova(TIPO_PERFIL_PUBLICADO, dados))
            for dados in perfis
        )
        if falhas:
            return _erro(MSG_FALHAS.format(falhas=falhas, total=len(perfis)))
        print(MSG_PUBLICADOS.format(total=len(perfis)))
        return 0
    finally:
        if integracao is not None:
            integracao.fechar()
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
