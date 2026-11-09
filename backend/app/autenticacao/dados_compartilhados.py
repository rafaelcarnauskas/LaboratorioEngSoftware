"""Interface remota de acesso ao banco compartilhado entre os microserviços.

Todo acesso ao banco compartilhado passa por :class:`InterfaceDadosCompartilhados`.
Entrada e saída são só dados JSON (o Perfil_Publico em camelCase, o mesmo de
``GET /api/v1/usuarios/me``), nunca objetos ORM nem ``Session``. Assim a
implementação SQL em processo pode ser trocada por um cliente HTTP/RPC sem mudar
quem chama.

Hoje a chamada é local (mesmo processo); o contrato só com JSON é o que permite
trocá-la por uma chamada remota.

Uso pelas outras partes (dependência FastAPI, só leitura)::

    from app.autenticacao.dados_compartilhados import obter_dados_compartilhados

    def rota(dados = Depends(obter_dados_compartilhados)):
        perfil = dados.buscar_usuario_publico(usuario_id)  # dict ou None

A escrita (``gravar_usuario_publico``) fica só com o assinante da mensagem
``usuario.perfil_publicado``. A réplica pode estar atrasada: para decidir
permissão use ``obter_usuario_atual``, que lê o banco próprio.
"""

from abc import ABC, abstractmethod

from fastapi import Request
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.autenticacao.modelo_compartilhado import UsuarioPublico


class InterfaceLeituraDadosCompartilhados(ABC):
    """Contrato de leitura do banco compartilhado, o único entregue às outras partes."""

    @abstractmethod
    def buscar_usuario_publico(self, usuario_id: str) -> dict | None:
        """Devolve o Perfil_Publico (JSON camelCase) ou ``None`` se não existir."""


class InterfaceDadosCompartilhados(InterfaceLeituraDadosCompartilhados):
    """Contrato completo do banco compartilhado; só tipos JSON na entrada e na saída."""

    @abstractmethod
    def gravar_usuario_publico(self, dados: dict) -> None:
        """Cria ou atualiza a réplica do Perfil_Publico (JSON camelCase).

        Ignora os dados quando ``updatedAt`` é mais antigo que o da réplica."""


class LeituraDadosCompartilhados(InterfaceLeituraDadosCompartilhados):
    """Expõe só ``buscar_usuario_publico`` de uma :class:`InterfaceDadosCompartilhados`."""

    def __init__(self, dados: InterfaceDadosCompartilhados) -> None:
        self._dados = dados

    def buscar_usuario_publico(self, usuario_id: str) -> dict | None:
        return self._dados.buscar_usuario_publico(usuario_id)


class AcessoDadosCompartilhadosSQL(InterfaceDadosCompartilhados):
    """Implementação em SQLAlchemy; única classe que abre ``Session`` no banco compartilhado."""

    def __init__(self, engine: Engine) -> None:
        self._fabrica = sessionmaker(bind=engine)

    def gravar_usuario_publico(self, dados: dict) -> None:
        # Import tardio: ``api.py`` importa ``servico.py``, que não deve depender deste módulo.
        from app.autenticacao.api import PerfilPublico

        perfil = PerfilPublico.model_validate(dados)
        with self._fabrica.begin() as db:
            # Trava a linha (PostgreSQL) e descarta mensagem entregue fora de ordem.
            atual = db.get(UsuarioPublico, perfil.id, with_for_update=True)
            if atual is not None and atual.atualizado_em > perfil.updated_at:
                return
            db.merge(
                UsuarioPublico(
                    id=perfil.id,
                    nome=perfil.name,
                    username=perfil.username,
                    email=perfil.email,
                    descricao=perfil.description,
                    foto=perfil.photo,
                    is_community_admin=perfil.is_community_admin,
                    is_system_admin=perfil.is_system_admin,
                    criado_em=perfil.created_at,
                    atualizado_em=perfil.updated_at,
                )
            )

    def buscar_usuario_publico(self, usuario_id: str) -> dict | None:
        from app.autenticacao.api import PerfilPublico

        if not isinstance(usuario_id, str) or not usuario_id:
            return None
        with self._fabrica() as db:
            linha = db.get(UsuarioPublico, usuario_id.lower())
            if linha is None:
                return None
            return PerfilPublico(
                id=linha.id,
                name=linha.nome,
                username=linha.username,
                email=linha.email,
                description=linha.descricao,
                photo=linha.foto,
                is_community_admin=linha.is_community_admin,
                is_system_admin=linha.is_system_admin,
                created_at=linha.criado_em,
                updated_at=linha.atualizado_em,
            ).model_dump(mode="json")


def obter_dados_compartilhados(request: Request) -> InterfaceLeituraDadosCompartilhados:
    """Dependência FastAPI: a interface de leitura do banco compartilhado montada em ``create_app()``."""
    dados = getattr(request.app.state, "dados_compartilhados", None)
    if dados is None:
        raise RuntimeError("app.state.dados_compartilhados não configurado em create_app()")
    return dados
