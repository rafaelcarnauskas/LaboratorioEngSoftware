"""Mensagens trocadas entre os microserviços (seção 5 do modelo de dados).

Toda mensagem tem o mesmo formato, que também é o da tabela ``mensagem`` do
banco compartilhado::

    {
      "mensagem_id": "8f1c…",          # uuid, usado para não processar duas vezes
      "tipo": "VideoPublicado",
      "servico_origem": "videos",
      "chave_entidade": "sports-1",
      "criada_em": "2026-11-08T14:00:00Z",
      "conteudo": {...}
    }
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from uuid import uuid4

from app.core.relogio import agora_utc

# Serviços (ids da tabela ``servico``).
AUTENTICACAO = "autenticacao"
COMUNIDADES = "comunidades"
VIDEOS = "videos"
BUSCA_LISTAS = "busca_listas"
HISTORICO = "historico"
INFRAESTRUTURA = "infraestrutura"

# Tipos de mensagem.
USUARIO_CADASTRADO = "UsuarioCadastrado"
PERFIL_ATUALIZADO = "PerfilAtualizado"
USUARIO_REMOVIDO = "UsuarioRemovido"
COMUNIDADE_CRIADA = "ComunidadeCriada"
COMUNIDADE_ATUALIZADA = "ComunidadeAtualizada"
MEMBRO_ENTROU = "MembroEntrou"
MEMBRO_SAIU = "MembroSaiu"
VIDEO_PUBLICADO = "VideoPublicado"
VIDEO_ATUALIZADO = "VideoAtualizado"
VIDEO_REMOVIDO = "VideoRemovido"
REPRODUCAO_REGISTRADA = "ReproducaoRegistrada"


def instante_iso(valor: datetime) -> str:
    """Instante UTC no formato das mensagens (``2026-11-08T14:00:00Z``)."""
    return valor.isoformat().replace("+00:00", "Z")


def ler_instante(texto: str) -> datetime:
    return datetime.fromisoformat(texto.replace("Z", "+00:00"))


@dataclass(frozen=True)
class Mensagem:
    mensagem_id: str
    tipo: str
    servico_origem: str
    chave_entidade: str
    criada_em: str
    conteudo: dict = field(default_factory=dict)

    @classmethod
    def nova(cls, tipo: str, servico_origem: str, chave_entidade: str, conteudo: dict) -> Mensagem:
        return cls(str(uuid4()), tipo, servico_origem, str(chave_entidade),
                   instante_iso(agora_utc()), conteudo)

    def para_dict(self) -> dict:
        return asdict(self)

    def para_json(self) -> str:
        return json.dumps(self.para_dict(), ensure_ascii=False)

    @classmethod
    def de_dict(cls, dados: dict) -> Mensagem:
        return cls(**dados)
