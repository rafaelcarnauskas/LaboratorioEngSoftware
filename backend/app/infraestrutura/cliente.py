"""Cliente da API de Dados Compartilhados, usado pelos microserviços.

Cada serviço recebe um :class:`ClienteDadosCompartilhados` com o próprio id; ele
nunca tem a URL do banco compartilhado. O transporte é escolhido na montagem
(:mod:`app.plataforma`):

- :class:`TransporteHTTP`: chamada remota a ``{CHOOSEN_INFRA_URL}/api/v1/infra/dados``
  com os cabeçalhos ``X-Servico`` e ``X-Credencial``;
- :class:`TransporteLocal`: a mesma operação no mesmo processo, sem rede. É o
  padrão enquanto todos os serviços rodam numa única aplicação.

Nos dois casos a infraestrutura confere a tabela ``permissao`` antes de executar,
e só tipos JSON entram e saem.
"""

from __future__ import annotations

from typing import Protocol

import httpx

from app.infraestrutura.dados import AcessoNegado, ServidorDadosCompartilhados

TIMEOUT_HTTP = 5.0


class ErroDadosCompartilhados(RuntimeError):
    """A API de Dados Compartilhados não respondeu como esperado."""


class Transporte(Protocol):
    def obter(self, servico_id: str, tabela: str, chave: str) -> dict | None: ...
    def listar(self, servico_id: str, tabela: str, filtros: dict[str, list]) -> list[dict]: ...
    def gravar(self, servico_id: str, tabela: str, chave: str, dados: dict) -> dict: ...


class TransporteLocal:
    def __init__(self, servidor: ServidorDadosCompartilhados) -> None:
        self._servidor = servidor

    def obter(self, servico_id, tabela, chave):
        return self._servidor.obter(servico_id, tabela, chave)

    def listar(self, servico_id, tabela, filtros):
        return self._servidor.listar(servico_id, tabela, filtros)

    def gravar(self, servico_id, tabela, chave, dados):
        return self._servidor.gravar(servico_id, tabela, dados)


class TransporteHTTP:
    def __init__(self, url_base: str, credenciais: dict[str, str]) -> None:
        self._url = url_base.rstrip("/") + "/api/v1/infra/dados"
        self._credenciais = credenciais

    def _cabecalhos(self, servico_id: str) -> dict[str, str]:
        return {"X-Servico": servico_id, "X-Credencial": self._credenciais.get(servico_id, "")}

    def _resposta(self, resposta: httpx.Response):
        if resposta.status_code == 403:
            raise AcessoNegado(resposta.json().get("detail", "Acesso negado."))
        if resposta.status_code >= 400:
            raise ErroDadosCompartilhados(f"API de Dados Compartilhados respondeu {resposta.status_code}.")
        return resposta.json()

    def obter(self, servico_id, tabela, chave):
        resposta = httpx.get(f"{self._url}/{tabela}/{chave}", headers=self._cabecalhos(servico_id),
                             timeout=TIMEOUT_HTTP)
        if resposta.status_code == 404:
            return None
        return self._resposta(resposta)

    def listar(self, servico_id, tabela, filtros):
        resposta = httpx.get(f"{self._url}/{tabela}", params=filtros, headers=self._cabecalhos(servico_id),
                             timeout=TIMEOUT_HTTP)
        return self._resposta(resposta)

    def gravar(self, servico_id, tabela, chave, dados):
        resposta = httpx.put(f"{self._url}/{tabela}/{chave}", json=dados,
                             headers=self._cabecalhos(servico_id), timeout=TIMEOUT_HTTP)
        return self._resposta(resposta)


class ClienteDadosCompartilhados:
    """Acesso de um serviço às tabelas compartilhadas (só o que a ``permissao`` deixa)."""

    def __init__(self, servico_id: str, transporte: Transporte) -> None:
        self.servico_id = servico_id
        self._transporte = transporte

    def obter(self, tabela: str, chave: str) -> dict | None:
        return self._transporte.obter(self.servico_id, tabela, str(chave))

    def listar(self, tabela: str, **filtros) -> list[dict]:
        """``listar("usuario_publico", usuario_id=[id1, id2])``."""
        normalizados = {
            coluna: [str(v) for v in (valores if isinstance(valores, (list, tuple, set)) else [valores])]
            for coluna, valores in filtros.items()
        }
        return self._transporte.listar(self.servico_id, tabela, normalizados)

    def gravar(self, tabela: str, chave: str, dados: dict) -> dict:
        return self._transporte.gravar(self.servico_id, tabela, str(chave), dados)
