"""Property 1: Validadores de campo seguem as regras do Requisito 1.

**Validates: Requirements 1.2, 1.6, 1.7, 1.8, 1.9**

Os oráculos abaixo recalculam a regra de cada critério diretamente (sem chamar o
validador nem reutilizar os padrões de ``servico.py``), para que a propriedade
compare a implementação com o texto do requisito.
"""

from __future__ import annotations

import base64
import string

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.autenticacao.servico import (
    MSG_DESCRICAO_INVALIDA,
    MSG_EMAIL_INVALIDO,
    MSG_FOTO_INVALIDA,
    MSG_NOME_INVALIDO,
    MSG_USERNAME_INVALIDO,
    normalizar_email,
    validar_descricao,
    validar_email,
    validar_foto,
    validar_nome,
    validar_username,
)
from app.tests import estrategias as e

FOTO_MAX_BYTES = 2_097_152  # 2 MB, valor literal do Requisito 1.9


# --- Oráculos independentes ---------------------------------------------------


def nome_ok(s: str) -> bool:
    return 1 <= len(s.strip()) <= 60


_USERNAME_PERMITIDOS = frozenset(string.ascii_letters + string.digits + "._")


def username_ok(s: str) -> bool:
    return 1 <= len(s) <= 30 and all(c in _USERNAME_PERMITIDOS for c in s)


def descricao_ok(s: str | None) -> bool:
    return len(s or "") <= 160


def email_ok(s: str) -> bool:
    """Requisito 1.2 + Email_Valido: ``^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$`` após normalizar."""
    n = s.strip().lower()
    if not 3 <= len(n) <= 254 or n.count("@") != 1:
        return False
    if any(c.isspace() for c in n):
        return False
    local, dominio = n.split("@")
    # Domínio = X.Y com X e Y não vazios: há um ponto que não é o primeiro nem o último.
    return bool(local) and "." in dominio[1:-1]


# --- Geradores locais (ampliam o espaço além das estratégias compartilhadas) --

_texto_qualquer = st.text(max_size=80)
# Alfabeto pequeno e "perigoso" para e-mails: espaços Unicode, "@", ".", caixa e
# um caractere cujo ``lower()`` muda de tamanho ("İ" → "i̇").
_texto_email = st.text(alphabet="aZ9.@_ \t\n\u00a0\u3000İ", max_size=20)


# --- Nome (1.6) ----------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(s=st.one_of(e.nomes_validos(), e.nomes_invalidos(), _texto_qualquer))
def test_validar_nome_segue_regra(s):
    resultado = validar_nome(s)
    if nome_ok(s):
        assert resultado is None
    else:
        assert resultado == MSG_NOME_INVALIDO


# --- Username (1.7) --------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(s=st.one_of(e.usernames_validos(), e.usernames_invalidos(), _texto_qualquer))
def test_validar_username_segue_regra(s):
    resultado = validar_username(s)
    if username_ok(s):
        assert resultado is None
    else:
        assert resultado == MSG_USERNAME_INVALIDO


@pytest.mark.parametrize("s", ["abc\n", "a b", "٣", "ａ", "a" * 31, ""])
def test_validar_username_recusa_casos_limite(s):
    assert validar_username(s) == MSG_USERNAME_INVALIDO


# --- Descrição (1.8) -------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(
    s=st.one_of(
        st.none(),
        e.descricoes_validas(),
        e.descricoes_invalidas(),
        st.text(max_size=200),
    )
)
def test_validar_descricao_segue_regra(s):
    resultado = validar_descricao(s)
    if descricao_ok(s):
        assert resultado is None
    else:
        assert resultado == MSG_DESCRICAO_INVALIDA


# --- E-mail (1.2) ----------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(
    s=st.one_of(
        e.emails_validos(), e.emails_invalidos(), _texto_email, _texto_qualquer
    )
)
def test_validar_email_segue_regra(s):
    resultado = validar_email(s)
    if email_ok(s):
        assert resultado is None
    else:
        assert resultado == MSG_EMAIL_INVALIDO


@settings(max_examples=100, deadline=None)
@given(data=st.data(), normalizado=e.emails_normalizados())
def test_normalizar_email_remove_espacos_e_caixa(data, normalizado):
    variacao = data.draw(e.variacoes_de_email(normalizado))
    assert normalizar_email(variacao) == normalizado
    assert validar_email(variacao) is None


# --- Foto (1.9) -----------------------------------------------------------------

_SUBTIPO = st.text(
    alphabet=string.ascii_letters + string.digits + ".+-", min_size=1, max_size=15
)
_PREFIXOS_VALIDOS = st.one_of(
    st.sampled_from(e.SUBTIPOS_IMAGEM), _SUBTIPO
).map(lambda subtipo: f"data:image/{subtipo};base64,")
_PREFIXOS_INVALIDOS = st.sampled_from([
    "",                          # sem prefixo
    "data:text/plain;base64,",   # não é imagem
    "data:image/png,",           # sem ;base64
    "data:image/;base64,",       # sem subtipo
    "data:image/png;base64",     # sem a vírgula
    "image/png;base64,",         # sem "data:"
    "DATA:image/png;base64,",    # esquema em maiúsculas
    " data:image/png;base64,",   # espaço antes
    "data:application/octet-stream;base64,",
])
# Prefixo rotulado com a validade esperada (o oráculo é o rótulo).
_prefixos = st.one_of(
    _PREFIXOS_VALIDOS.map(lambda p: (p, True)),
    _PREFIXOS_INVALIDOS.map(lambda p: (p, False)),
)


def _data_url(prefixo: str, conteudo: bytes) -> str:
    return prefixo + base64.b64encode(conteudo).decode("ascii")


@settings(max_examples=100, deadline=None)
@given(prefixo=_prefixos, conteudo=st.binary(max_size=4096))
def test_validar_foto_exige_prefixo_de_imagem(prefixo, conteudo):
    p, prefixo_ok = prefixo
    foto = _data_url(p, conteudo)
    if foto == "" or prefixo_ok:
        # ``""`` (prefixo vazio + conteúdo vazio) é a foto vazia, que é aceita.
        assert validar_foto(foto) is None
    else:
        assert validar_foto(foto) == MSG_FOTO_INVALIDA


@settings(max_examples=30, deadline=None)
@given(
    n_bytes=st.one_of(
        st.sampled_from([FOTO_MAX_BYTES, FOTO_MAX_BYTES + 1]),
        st.integers(min_value=FOTO_MAX_BYTES - 64, max_value=FOTO_MAX_BYTES + 64),
    ),
    subtipo=st.sampled_from(e.SUBTIPOS_IMAGEM),
    semente=st.integers(min_value=0, max_value=2**32 - 1),
)
def test_validar_foto_respeita_limite_de_2mb(n_bytes, subtipo, semente):
    foto = e.foto_data_url(n_bytes, subtipo, semente)
    if n_bytes <= FOTO_MAX_BYTES:
        assert validar_foto(foto) is None
    else:
        assert validar_foto(foto) == MSG_FOTO_INVALIDA


def test_validar_foto_aceita_exatamente_2mb():
    foto = e.foto_data_url(FOTO_MAX_BYTES)
    assert len(base64.b64decode(foto.split(",", 1)[1])) == FOTO_MAX_BYTES
    assert validar_foto(foto) is None


def test_validar_foto_recusa_um_byte_acima_de_2mb():
    foto = e.foto_data_url(FOTO_MAX_BYTES + 1)
    assert len(base64.b64decode(foto.split(",", 1)[1])) == FOTO_MAX_BYTES + 1
    assert validar_foto(foto) == MSG_FOTO_INVALIDA


@pytest.mark.parametrize("foto", ["", None])
def test_validar_foto_aceita_vazia(foto):
    assert validar_foto(foto) is None


@pytest.mark.parametrize(
    "foto",
    [
        "data:image/png;base64,@@@@",  # fora do alfabeto base64
        "data:image/png;base64,QUJ",   # padding incorreto
        "data:image/png;base64,QU JD", # espaço no meio
    ],
)
def test_validar_foto_recusa_base64_malformado(foto):
    assert validar_foto(foto) == MSG_FOTO_INVALIDA
