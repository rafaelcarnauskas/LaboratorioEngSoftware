"""Configuração do Backend lida de variáveis de ambiente (Requisito 13)."""

import re
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.db.base import normalizar_url_postgres

# backend/ (core -> app -> backend)
BACKEND_DIR = Path(__file__).resolve().parents[2]

TTL_MIN = 1
TTL_MAX = 525600  # 365 dias em minutos

_SO_DIGITOS = re.compile(r"[0-9]+")


class Configuracao(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CHOOSEN_",
        extra="ignore",
        # Permite Configuracao(database_url=..., cors_origins=...) nos testes.
        validate_by_name=True,
        validate_by_alias=True,
    )

    env: Literal["development", "test", "production"] = "development"
    # CHOOSEN_* tem prioridade; DATABASE_URL e CORS_ORIGINS são os nomes usados no Render.
    database_url: str = Field(
        default=f"sqlite:///{(BACKEND_DIR / 'choosen.db').as_posix()}",
        validation_alias=AliasChoices("CHOOSEN_DATABASE_URL", "DATABASE_URL"),
    )
    cors_origins: str = Field(
        default="http://localhost:5173",
        validation_alias=AliasChoices("CHOOSEN_CORS_ORIGINS", "CORS_ORIGINS"),
    )
    session_ttl_minutes: int = Field(default=10080, ge=TTL_MIN, le=TTL_MAX, strict=False)
    frontend_url: str = "http://localhost:5173"

    @field_validator("session_ttl_minutes", mode="before")
    @classmethod
    def _ttl_so_digitos(cls, valor):
        # Variáveis de ambiente chegam como texto: aceita só "10", não "10.0", "1e3", " " ou "-5".
        if isinstance(valor, str):
            if not _SO_DIGITOS.fullmatch(valor):
                raise ValueError("deve conter apenas dígitos")
            return int(valor)
        if isinstance(valor, bool) or not isinstance(valor, int):
            raise ValueError("deve ser um inteiro")
        return valor

    @field_validator("database_url")
    @classmethod
    def _normalizar_database_url(cls, valor: str) -> str:
        return normalizar_url_postgres(valor)

    @property
    def lista_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


_MENSAGENS = {
    "env": "CHOOSEN_ENV inválida: use development, test ou production.",
    "session_ttl_minutes": (
        f"CHOOSEN_SESSION_TTL_MINUTES inválida: use um inteiro entre {TTL_MIN} e {TTL_MAX}."
    ),
}


def _campo_do_erro(loc: tuple) -> str:
    nome = str(loc[0]) if loc else ""
    if nome.upper().startswith("CHOOSEN_"):
        nome = nome[len("CHOOSEN_"):]
    return nome.lower()


def carregar_configuracao() -> Configuracao:
    """Lê as variáveis; em valor inválido encerra o processo com mensagem clara."""
    try:
        return Configuracao()
    except ValidationError as erro:
        mensagens: list[str] = []
        for detalhe in erro.errors():
            campo = _campo_do_erro(detalhe.get("loc", ()))
            mensagem = _MENSAGENS.get(
                campo, f"CHOOSEN_{campo.upper()} inválida: {detalhe.get('msg', 'valor inválido')}."
            )
            if mensagem not in mensagens:
                mensagens.append(mensagem)
        raise SystemExit("\n".join(mensagens)) from None
