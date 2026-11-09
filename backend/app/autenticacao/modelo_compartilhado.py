"""Tabelas do banco compartilhado entre os microserviços.

`usuario_publico` é a réplica do Perfil_Publico de cada Usuario. O dono do dado
é a tabela `usuario` do banco próprio da autenticação: a réplica é gravada a
partir da mensagem `usuario.perfil_publicado` e lida pela
`InterfaceDadosCompartilhados`. As duas tabelas têm o mesmo `id`, mas não há FK
entre elas porque ficam em bancos diferentes. Não há senha, sessão nem token aqui.

Usa um `DeclarativeBase` próprio (e não o `Base` de `app.db.base`) para que o
esquema deste banco venha só das migrations de `alembic_compartilhado/`.
"""

from datetime import datetime

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.base import DataHoraUTC


class BaseCompartilhado(DeclarativeBase):
    pass


class UsuarioPublico(BaseCompartilhado):
    __tablename__ = "usuario_publico"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    nome: Mapped[str] = mapped_column(String(60), nullable=False)
    username: Mapped[str] = mapped_column(String(30), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    descricao: Mapped[str] = mapped_column(String(160), nullable=False)
    foto: Mapped[str] = mapped_column(Text, nullable=False)
    is_community_admin: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_system_admin: Mapped[bool] = mapped_column(Boolean, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DataHoraUTC, nullable=False)
