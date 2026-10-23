"""Relógio do Backend: fonte única do instante atual, em UTC.

Os serviços recebem ``agora`` como parâmetro. Nos endpoints, esse valor vem da
dependência :func:`obter_relogio`, que os testes sobrescrevem com
``app.dependency_overrides[obter_relogio]`` para controlar expirações sem ``sleep``.
"""

from datetime import datetime, timezone


def agora_utc() -> datetime:
    """Devolve o instante atual como ``datetime`` com fuso UTC."""
    return datetime.now(timezone.utc)


def obter_relogio() -> datetime:
    """Dependência FastAPI que entrega o instante atual (UTC) a cada requisição."""
    return agora_utc()
