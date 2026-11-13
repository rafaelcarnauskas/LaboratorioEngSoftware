"""Mensagens publicadas pela autenticação: UsuarioCadastrado, PerfilAtualizado e UsuarioRemovido.

A autenticação é a fonte da verdade do usuário. Um evento ``before_flush`` na
fábrica de sessões grava a mensagem em ``mensagem_enviada`` (outbox) na mesma
transação em que um Usuario é criado, alterado ou apagado. Assim cadastro,
edição de perfil, troca e redefinição de senha e semeadura publicam sem mudar
``servico.py``. Depois do ``commit``, o :class:`~app.mensageria.outbox.Outbox`
entrega a mensagem ao barramento da infraestrutura, que atualiza
``usuario_publico`` no banco compartilhado.

O conteúdo não tem e-mail, senha, sessões nem tokens.
"""

from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker

from app.autenticacao.modelo import Usuario, _novo_id
from app.mensageria import (
    PERFIL_ATUALIZADO,
    USUARIO_CADASTRADO,
    USUARIO_REMOVIDO,
    instante_iso,
)
from app.mensageria.outbox import Outbox


def conteudo_usuario(usuario: Usuario) -> dict:
    """Perfil público do usuário no formato de ``usuario_publico``."""
    return {
        "usuario_id": usuario.id,
        "username": usuario.username,
        "nome": usuario.nome,
        "descricao": usuario.descricao or "",
        "foto_url": usuario.foto or "",
        "admin_comunidade": bool(usuario.is_community_admin),
        "atualizado_em": instante_iso(usuario.atualizado_em),
    }


def ligar_mensagens_de_usuarios(fabrica: sessionmaker, outbox: Outbox) -> None:
    """Grava a mensagem do Usuario criado/alterado/apagado na mesma transação."""

    def _antes_do_flush(sessao: Session, _contexto, _instancias) -> None:
        for obj in list(sessao.new):
            if isinstance(obj, Usuario):
                if obj.id is None:
                    obj.id = _novo_id()
                outbox.registrar(sessao, USUARIO_CADASTRADO, obj.id, conteudo_usuario(obj))
        for obj in list(sessao.dirty):
            if isinstance(obj, Usuario) and sessao.is_modified(obj):
                outbox.registrar(sessao, PERFIL_ATUALIZADO, obj.id, conteudo_usuario(obj))
        for obj in list(sessao.deleted):
            if isinstance(obj, Usuario):
                outbox.registrar(sessao, USUARIO_REMOVIDO, obj.id, {"usuario_id": obj.id})

    event.listen(fabrica, "before_flush", _antes_do_flush)
