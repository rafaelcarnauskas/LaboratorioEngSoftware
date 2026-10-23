"""Property 15: Configuração inválida impede a inicialização.

**Validates: Requirements 2.8, 13.1, 13.4, 13.6, 13.7**
"""

import os
import re
from contextlib import contextmanager

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.config import TTL_MAX, TTL_MIN, carregar_configuracao

AMBIENTES_VALIDOS = ("development", "test", "production")
_FALLBACKS = ("DATABASE_URL", "CORS_ORIGINS")
_SO_DIGITOS = re.compile(r"[0-9]+")

# Variáveis de ambiente não aceitam o caractere nulo; surrogates já ficam fora de st.characters().
_TEXTO_ENV = st.text(alphabet=st.characters(blacklist_characters="\x00"), max_size=12)


@contextmanager
def ambiente_limpo():
    """MonkeyPatch por exemplo do Hypothesis, sem nenhuma variável real vazando."""
    with pytest.MonkeyPatch.context() as mp:
        for nome in list(os.environ):
            if nome.upper().startswith("CHOOSEN_") or nome.upper() in _FALLBACKS:
                mp.delenv(nome, raising=False)
        yield mp


def _ttl_valido(valor: str) -> bool:
    return bool(_SO_DIGITOS.fullmatch(valor)) and TTL_MIN <= int(valor) <= TTL_MAX


valores_ttl = st.one_of(
    st.integers(min_value=TTL_MIN, max_value=TTL_MAX).map(str),
    st.integers(min_value=-10**7, max_value=10**7).map(str),
    st.from_regex(r"0{0,3}[0-9]{1,7}", fullmatch=True),
    st.sampled_from(["", " ", " 10", "10 ", "10.0", "1e3", "+5", "-5", "0", "525601", "٣"]),
    _TEXTO_ENV,
)

valores_env = st.one_of(
    st.sampled_from(AMBIENTES_VALIDOS),
    st.sampled_from(AMBIENTES_VALIDOS).map(str.upper),
    st.sampled_from(AMBIENTES_VALIDOS).map(lambda e: f" {e}"),
    st.sampled_from(["", "prod", "dev", "testing", "Production"]),
    _TEXTO_ENV,
)

_ORIGEM = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:/.-_",
    min_size=1,
    max_size=25,
)
_ESPACOS = st.text(alphabet=" \t", max_size=3)


@settings(max_examples=100, deadline=None)
@given(valor=valores_ttl)
def test_ttl_invalido_impede_inicializacao(valor):
    with ambiente_limpo() as mp:
        mp.setenv("CHOOSEN_SESSION_TTL_MINUTES", valor)
        if _ttl_valido(valor):
            assert carregar_configuracao().session_ttl_minutes == int(valor)
        else:
            with pytest.raises(SystemExit) as erro:
                carregar_configuracao()
            mensagem = str(erro.value.code)
            assert "CHOOSEN_SESSION_TTL_MINUTES" in mensagem
            assert str(TTL_MIN) in mensagem and str(TTL_MAX) in mensagem


@settings(max_examples=100, deadline=None)
@given(valor=valores_env)
def test_env_invalido_impede_inicializacao(valor):
    with ambiente_limpo() as mp:
        mp.setenv("CHOOSEN_ENV", valor)
        if valor in AMBIENTES_VALIDOS:
            assert carregar_configuracao().env == valor
        else:
            with pytest.raises(SystemExit) as erro:
                carregar_configuracao()
            mensagem = str(erro.value.code)
            assert "CHOOSEN_ENV" in mensagem
            assert all(ambiente in mensagem for ambiente in AMBIENTES_VALIDOS)


@settings(max_examples=100, deadline=None)
@given(origens=st.lists(_ORIGEM, min_size=1, max_size=5), data=st.data())
def test_lista_cors_remove_espacos_e_preserva_ordem(origens, data):
    partes = [
        data.draw(_ESPACOS) + origem + data.draw(_ESPACOS) for origem in origens
    ]
    with ambiente_limpo() as mp:
        mp.setenv("CHOOSEN_CORS_ORIGINS", ",".join(partes))
        assert carregar_configuracao().lista_cors == origens


def test_ambiente_padrao_e_development():
    with ambiente_limpo():
        configuracao = carregar_configuracao()
        assert configuracao.env == "development"
        assert configuracao.session_ttl_minutes == 10080
