"""Primitivas de segurança: hash de senha (Argon2id) e tokens opacos.

- Senhas: Argon2id via ``argon2-cffi`` com os parâmetros padrão (RFC 9106,
  perfil low-memory). Só o hash é persistido (Requisito 1.5).
- Tokens: ``secrets.token_urlsafe(32)`` (256 bits, Requisito 2.3). O banco guarda
  apenas o SHA-256 hexadecimal do token (Requisito 2.4).

O hasher fica no atributo de módulo ``_hasher`` e é trocado por um ponto único,
:func:`definir_hasher`, para que o ``conftest.py`` use parâmetros mínimos.
"""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Argon2id com os parâmetros padrão da biblioteca.
_hasher: PasswordHasher = PasswordHasher()


def obter_hasher() -> PasswordHasher:
    """Devolve o hasher em uso."""
    return _hasher


def definir_hasher(hasher: PasswordHasher) -> PasswordHasher:
    """Troca o hasher em uso e devolve o anterior (para restaurar depois)."""
    global _hasher
    anterior = _hasher
    _hasher = hasher
    return anterior


def gerar_hash_senha(senha: str) -> str:
    """Gera o Hash_Senha (Argon2id, com sal aleatório) de ``senha``."""
    return _hasher.hash(senha)


def verificar_senha(hash_senha: str, senha: str) -> bool:
    """Indica se ``senha`` corresponde a ``hash_senha``.

    Devolve ``False`` (sem lançar) quando a senha não confere
    (``VerifyMismatchError`` e demais ``VerificationError``) ou quando o hash é
    inválido (``InvalidHashError``).
    """
    try:
        return _hasher.verify(hash_senha, senha)
    except (VerificationError, InvalidHashError):
        return False


def gerar_token() -> str:
    """Gera um token opaco com 256 bits de entropia, seguro para URL."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Devolve o SHA-256 hexadecimal de ``token`` (o que o banco guarda)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# Hash de uma senha aleatória que ninguém conhece. O login de e-mail inexistente
# verifica a senha contra ele para gastar o mesmo tempo de um login real
# (Requisito 3.4). Gerado com o hasher de produção na importação do módulo.
HASH_FICTICIO: str = gerar_hash_senha(secrets.token_urlsafe(32))
