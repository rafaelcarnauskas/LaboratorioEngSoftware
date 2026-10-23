"""Geradores Hypothesis dos testes da Parte 1 (autenticação e conta).

Os limites seguem o Requisito 1 e as constantes de ``app.autenticacao.servico``.
Cada função devolve uma estratégia; as "válidas" passam no validador
correspondente e as "inválidas" falham nele.

- Nomes: ``nomes_validos``, ``nomes_invalidos`` (Unicode e espaços nas pontas).
- Usernames: ``usernames_validos``, ``usernames_invalidos``.
- E-mails: ``emails_normalizados`` (já em Email_Normalizado),
  ``variacoes_de_email(email)`` (caixa e espaços aleatórios),
  ``emails_validos`` (normalizado com variação) e ``emails_invalidos``
  (sem ``@``, dois ``@``, sem ponto no domínio, mais de 254, vazio).
- Descrições: ``descricoes_validas``, ``descricoes_invalidas`` (perto de 160).
- Fotos: ``foto_data_url(n_bytes)``, ``fotos_validas``, ``fotos_invalidas``
  (tamanhos perto de 2 097 152 bytes, incluindo o limite e um byte acima).
- Senhas: ``senhas`` (0 a 200), ``senhas_validas``, ``senhas_invalidas``.
- Tokens: ``tokens_aleatorios`` (ASCII sem espaços, seguro para cabeçalho).
"""

from __future__ import annotations

import base64
import random
import string

from hypothesis import strategies as st

NOME_MAX = 60
USERNAME_MAX = 30
EMAIL_MAX = 254
DESCRICAO_MAX = 160
FOTO_MAX_BYTES = 2_097_152
SENHA_MIN = 8
SENHA_MAX = 128
SENHA_GERADA_MAX = 200

_CARACTERES_USERNAME = string.ascii_letters + string.digits + "._"
# Espaços que str.strip() remove, para testar a limpeza das pontas.
_ESPACOS_PONTAS = " \t\u00a0\u3000"

# Texto Unicode "visível": letras, marcas, números, pontuação, símbolos e espaços.
_UNICODE = st.characters(
    codec="utf-8",
    categories=("L", "M", "N", "P", "S", "Zs"),
)
# Sem espaço nenhum: str.strip() não altera textos feitos só disto.
_UNICODE_SEM_ESPACO = st.characters(codec="utf-8", categories=("L", "M", "N", "P", "S"))


def _espacos(max_size: int = 3) -> st.SearchStrategy[str]:
    return st.text(alphabet=_ESPACOS_PONTAS, max_size=max_size)


def _com_pontas(nucleo: st.SearchStrategy[str]) -> st.SearchStrategy[str]:
    return st.tuples(_espacos(), nucleo, _espacos()).map("".join)


# --- Nomes -------------------------------------------------------------------


def nomes_validos() -> st.SearchStrategy[str]:
    """1 a 60 caracteres após ``strip()``, com espaços aleatórios nas pontas."""
    nucleo = st.one_of(
        st.text(alphabet=_UNICODE, min_size=1, max_size=NOME_MAX),
        st.text(alphabet=_UNICODE_SEM_ESPACO, min_size=NOME_MAX - 3, max_size=NOME_MAX),
    ).map(str.strip).filter(bool)
    return _com_pontas(nucleo)


def nomes_invalidos() -> st.SearchStrategy[str]:
    """Vazio, só espaços ou mais de 60 caracteres após ``strip()``."""
    return st.one_of(
        _espacos(max_size=5),
        _com_pontas(st.text(alphabet=_UNICODE_SEM_ESPACO, min_size=NOME_MAX + 1, max_size=NOME_MAX + 20)),
    )


# --- Usernames ---------------------------------------------------------------


def usernames_validos() -> st.SearchStrategy[str]:
    """``^[A-Za-z0-9._]{1,30}$``."""
    return st.text(alphabet=_CARACTERES_USERNAME, min_size=1, max_size=USERNAME_MAX)


def usernames_invalidos() -> st.SearchStrategy[str]:
    """Vazio, mais de 30 caracteres ou com caractere fora de ``[A-Za-z0-9._]``."""
    proibido = st.sampled_from([" ", "-", "@", "!", "#", "/", "á", "ç", "ü", "\n", "\t", "+"])
    trecho = st.text(alphabet=_CARACTERES_USERNAME, max_size=14)
    return st.one_of(
        st.just(""),
        st.text(alphabet=_CARACTERES_USERNAME, min_size=USERNAME_MAX + 1, max_size=USERNAME_MAX + 15),
        st.tuples(trecho, proibido, trecho).map("".join),
    )


# --- E-mails -----------------------------------------------------------------

_LOCAL = string.ascii_lowercase + string.digits + "._%+-"
_ROTULO = string.ascii_lowercase + string.digits + "-"
_DOMINIO_LONGO = "exemplo.com"


def _dominios() -> st.SearchStrategy[str]:
    rotulo = st.text(alphabet=_ROTULO, min_size=1, max_size=15)
    tld = st.text(alphabet=string.ascii_lowercase, min_size=2, max_size=6)
    return st.tuples(st.lists(rotulo, min_size=1, max_size=2), tld).map(
        lambda partes: ".".join([*partes[0], partes[1]])
    )


def emails_normalizados() -> st.SearchStrategy[str]:
    """Email_Valido já normalizado (minúsculas, sem espaços), inclusive perto de 254."""
    curtos = st.tuples(st.text(alphabet=_LOCAL, min_size=1, max_size=20), _dominios()).map(
        lambda p: f"{p[0]}@{p[1]}"
    )
    sufixo = "@" + _DOMINIO_LONGO
    longos = st.integers(min_value=EMAIL_MAX - 10, max_value=EMAIL_MAX).flatmap(
        lambda total: st.text(
            alphabet=_LOCAL, min_size=total - len(sufixo), max_size=total - len(sufixo)
        ).map(lambda local: local + sufixo)
    )
    return st.one_of(curtos, longos)


def variacoes_de_email(email: str) -> st.SearchStrategy[str]:
    """Mesmo Email_Normalizado com caixa e espaços nas pontas aleatórios."""
    caixa = st.lists(st.booleans(), min_size=len(email), max_size=len(email)).map(
        lambda maiusculas: "".join(c.upper() if m else c for c, m in zip(email, maiusculas))
    )
    pontas = st.text(alphabet=" \t", max_size=3)
    return st.tuples(pontas, caixa, pontas).map("".join)


def emails_validos() -> st.SearchStrategy[str]:
    """Email_Valido com caixa e espaços aleatórios (normaliza para ``emails_normalizados``)."""
    return emails_normalizados().flatmap(variacoes_de_email)


def emails_invalidos() -> st.SearchStrategy[str]:
    """Sem ``@``, com dois ``@``, sem ponto no domínio, mais de 254 ou vazio."""
    local = st.text(alphabet=_LOCAL, min_size=1, max_size=20)
    rotulo = st.text(alphabet=_ROTULO, min_size=1, max_size=15)
    sem_arroba = st.text(alphabet=_LOCAL, min_size=1, max_size=40)
    dois_arrobas = st.tuples(local, local, _dominios()).map(lambda p: f"{p[0]}@{p[1]}@{p[2]}")
    sem_ponto = st.tuples(local, rotulo).map(lambda p: f"{p[0]}@{p[1]}")
    sufixo = "@" + _DOMINIO_LONGO
    longo = st.integers(min_value=EMAIL_MAX + 1, max_value=EMAIL_MAX + 40).flatmap(
        lambda total: st.text(
            alphabet=_LOCAL, min_size=total - len(sufixo), max_size=total - len(sufixo)
        ).map(lambda texto: texto + sufixo)
    )
    vazio = st.text(alphabet=" \t", max_size=3)
    return st.one_of(sem_arroba, dois_arrobas, sem_ponto, longo, vazio)


# --- Descrições --------------------------------------------------------------


def descricoes_validas() -> st.SearchStrategy[str]:
    """0 a 160 caracteres, com ênfase perto de 160."""
    return st.one_of(
        st.text(alphabet=_UNICODE, max_size=DESCRICAO_MAX),
        st.text(alphabet=_UNICODE, min_size=DESCRICAO_MAX - 5, max_size=DESCRICAO_MAX),
    )


def descricoes_invalidas() -> st.SearchStrategy[str]:
    """161 a 200 caracteres."""
    return st.text(alphabet=_UNICODE, min_size=DESCRICAO_MAX + 1, max_size=DESCRICAO_MAX + 40)


# --- Fotos -------------------------------------------------------------------

SUBTIPOS_IMAGEM = ("png", "jpeg", "gif", "webp", "svg+xml")


def foto_data_url(n_bytes: int, subtipo: str = "png", semente: int = 0) -> str:
    """Data URL ``data:image/<subtipo>;base64,`` com exatamente ``n_bytes`` decodificados.

    O conteúdo vem de ``random.Random(semente)``, então é determinístico.
    """
    conteudo = random.Random(semente).randbytes(n_bytes)
    return f"data:image/{subtipo};base64,{base64.b64encode(conteudo).decode('ascii')}"


def _fotos(tamanhos: st.SearchStrategy[int]) -> st.SearchStrategy[str]:
    return st.builds(
        foto_data_url,
        tamanhos,
        st.sampled_from(SUBTIPOS_IMAGEM),
        st.integers(min_value=0, max_value=2**32 - 1),
    )


def tamanhos_foto_validos() -> st.SearchStrategy[int]:
    return st.one_of(
        st.just(FOTO_MAX_BYTES),
        st.integers(min_value=FOTO_MAX_BYTES - 64, max_value=FOTO_MAX_BYTES),
        st.integers(min_value=0, max_value=2048),
    )


def tamanhos_foto_invalidos() -> st.SearchStrategy[int]:
    return st.one_of(
        st.just(FOTO_MAX_BYTES + 1),
        st.integers(min_value=FOTO_MAX_BYTES + 1, max_value=FOTO_MAX_BYTES + 64),
    )


def fotos_validas() -> st.SearchStrategy[str]:
    """``""`` ou data URL de imagem com até 2 097 152 bytes."""
    return st.one_of(st.just(""), _fotos(tamanhos_foto_validos()))


def fotos_invalidas() -> st.SearchStrategy[str]:
    """Acima de 2 097 152 bytes, prefixo errado ou base64 malformado."""
    malformadas = st.sampled_from([
        "QUJD",                               # sem prefixo
        "data:text/plain;base64,QUJD",        # não é imagem
        "data:image/png,QUJD",                # sem ;base64
        "data:image/;base64,QUJD",            # sem subtipo
        "data:image/png;base64,@@@@",         # fora do alfabeto base64
        "data:image/png;base64,QUJ",          # padding incorreto
        "data:image/png;base64,QU JD",        # espaço no meio
    ])
    return st.one_of(_fotos(tamanhos_foto_invalidos()), malformadas)


# --- Senhas ------------------------------------------------------------------

_SENHA_CHARS = st.characters(codec="utf-8")


def senhas() -> st.SearchStrategy[str]:
    """0 a 200 caracteres Unicode quaisquer."""
    return st.text(alphabet=_SENHA_CHARS, max_size=SENHA_GERADA_MAX)


def senhas_validas() -> st.SearchStrategy[str]:
    """8 a 128 caracteres."""
    return st.text(alphabet=_SENHA_CHARS, min_size=SENHA_MIN, max_size=SENHA_MAX)


def senhas_invalidas() -> st.SearchStrategy[str]:
    """0 a 7 ou 129 a 200 caracteres."""
    return st.one_of(
        st.text(alphabet=_SENHA_CHARS, max_size=SENHA_MIN - 1),
        st.text(alphabet=_SENHA_CHARS, min_size=SENHA_MAX + 1, max_size=SENHA_GERADA_MAX),
    )


# --- Tokens ------------------------------------------------------------------

_URLSAFE = string.ascii_letters + string.digits + "-_"
_ASCII_SEM_ESPACO = "".join(c for c in string.printable if not c.isspace())


def tokens_aleatorios(min_size: int = 1) -> st.SearchStrategy[str]:
    """Tokens que (quase certamente) não existem no banco: formato de
    ``token_urlsafe(32)`` (43 caracteres), outros tamanhos e ASCII imprimível
    sem espaços (seguro para ``Authorization: Bearer <token>`` e JSON)."""
    return st.one_of(
        st.text(alphabet=_URLSAFE, min_size=43, max_size=43),
        st.text(alphabet=_URLSAFE, min_size=min_size, max_size=80),
        st.text(alphabet=_ASCII_SEM_ESPACO, min_size=min_size, max_size=80),
    )
