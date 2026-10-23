"""Property 16: Username derivado é sempre válido e único.

**Validates: Requirements 4.3, 4.4**

Para qualquer e-mail válido e qualquer conjunto de usernames já ocupados
(gravados com caixa variada), o username que ``criar_usuario`` atribui:

- casa com ``^[A-Za-z0-9._]{1,30}$``;
- tem ``lower()`` fora dos ocupados (comparação sem diferenciar caixa);
- é igual ao oráculo: ``base`` se livre, senão ``base[:30-len(str(n))] + str(n)``
  para o menor ``n >= 2`` livre, onde ``base`` é a parte local filtrada para
  ``[A-Za-z0-9._]`` e truncada em 30 (ou ``usuario`` quando vazia).

O oráculo recalcula a regra direto do texto do requisito, sem usar
``derivar_username_base`` nem ``candidato_username``. Cada exemplo roda sobre
uma cópia própria do banco-modelo.
"""

from __future__ import annotations

import re
import string
from datetime import UTC, datetime

from hypothesis import assume, given, settings
from hypothesis import strategies as st
from sqlalchemy import func, select

from app.autenticacao.modelo import Usuario
from app.autenticacao.servico import criar_usuario, normalizar_email
from app.tests import estrategias as e

USERNAME_MAX = 30  # Requisito 1.7
PADRAO_USERNAME = re.compile(r"[A-Za-z0-9._]{1,30}")
DOMINIO_OCUPADOS = "ocupados.invalid"
CRIADO_EM = datetime(2025, 6, 1, 9, 30, tzinfo=UTC)


# --- Oráculo independente -----------------------------------------------------


def base_esperada(email_normalizado: str) -> str:
    local = email_normalizado.split("@", 1)[0]
    filtrada = "".join(c for c in local if c in string.ascii_letters + string.digits + "._")
    return filtrada[:USERNAME_MAX] or "usuario"


def candidato_esperado(base: str, n: int) -> str:
    if n == 1:
        return base
    sufixo = str(n)
    return base[: USERNAME_MAX - len(sufixo)] + sufixo


def username_esperado(base: str, ocupados_minusculos: set[str]) -> str:
    n = 1
    while candidato_esperado(base, n).lower() in ocupados_minusculos:
        n += 1
    return candidato_esperado(base, n)


# --- Geradores ----------------------------------------------------------------


def _emails_cadastro() -> st.SearchStrategy[str]:
    """E-mails válidos, incluindo parte local que filtra para vazio (base ``usuario``)
    e parte local longa (base truncada em 30)."""
    so_proibidos = st.tuples(
        st.text(alphabet="%+-", min_size=1, max_size=10),
        st.sampled_from(["exemplo.com", "mail.org"]),
    ).map(lambda p: f"{p[0]}@{p[1]}")
    perto_de_30 = st.tuples(
        st.text(alphabet=string.ascii_lowercase + string.digits + "._", min_size=26, max_size=34),
        st.sampled_from(["exemplo.com", "mail.org"]),
    ).map(lambda p: f"{p[0]}@{p[1]}")
    return st.one_of(e.emails_validos(), so_proibidos.flatmap(e.variacoes_de_email), perto_de_30)


def _com_caixa_aleatoria(texto: str) -> st.SearchStrategy[str]:
    return st.lists(st.booleans(), min_size=len(texto), max_size=len(texto)).map(
        lambda maiusculas: "".join(c.upper() if m else c for c, m in zip(texto, maiusculas))
    )


@st.composite
def _cenarios(draw) -> tuple[str, list[str]]:
    """E-mail do cadastro e usernames ocupados (únicos sem diferenciar caixa)."""
    email = draw(_emails_cadastro())
    base = base_esperada(normalizar_email(email))
    # Sufixos ocupados: uma sequência 1..k (às vezes passando de 50, o tamanho do
    # lote consultado pelo serviço) mais alguns ``n`` soltos.
    k = draw(st.one_of(st.integers(0, 12), st.integers(48, 60)))
    soltos = draw(st.sets(st.integers(1, 120), max_size=8))
    ns = set(range(1, k + 1)) | soltos
    derivados = [candidato_esperado(base, n) for n in sorted(ns)]
    # Usernames quaisquer (podem ou não coincidir com algum candidato).
    aleatorios = draw(st.lists(e.usernames_validos(), max_size=5))

    ocupados: dict[str, str] = {}
    for username in [*derivados, *aleatorios]:
        variante = draw(_com_caixa_aleatoria(username))
        ocupados.setdefault(variante.lower(), variante)
    return email, list(ocupados.values())


# --- Propriedade ----------------------------------------------------------------


def _ocupar(db, usernames: list[str]) -> None:
    db.add_all(
        Usuario(
            email=f"ocupado{i}@{DOMINIO_OCUPADOS}",
            username=username,
            username_normalizado=username.lower(),
            hash_senha="hash-qualquer",
            nome=f"Ocupado {i}",
            descricao="",
            foto="",
            is_community_admin=False,
            is_system_admin=False,
            criado_em=CRIADO_EM,
            atualizado_em=CRIADO_EM,
        )
        for i, username in enumerate(usernames)
    )
    db.commit()


@settings(max_examples=100, deadline=None)
@given(cenario=_cenarios())
def test_username_derivado_e_valido_unico_e_segue_a_regra(criar_app_isolada, cenario):
    email, ocupados = cenario
    email_normalizado = normalizar_email(email)
    assume(not email_normalizado.endswith("@" + DOMINIO_OCUPADOS))
    ocupados_minusculos = {u.lower() for u in ocupados}
    esperado = username_esperado(base_esperada(email_normalizado), ocupados_minusculos)

    with criar_app_isolada() as ctx:
        with ctx.sessao() as db:
            _ocupar(db, ocupados)

        with ctx.sessao() as db:
            usuario = criar_usuario(db, "Fulano de Tal", email, "senha-valida-123", ctx.relogio.agora())
            username = usuario.username
            normalizado = usuario.username_normalizado

        assert PADRAO_USERNAME.fullmatch(username), username
        assert normalizado == username.lower()
        assert username.lower() not in ocupados_minusculos
        assert username == esperado

        # Persistido: exatamente um Usuario com esse username (sem diferenciar caixa).
        with ctx.sessao() as db:
            iguais = db.scalar(
                select(func.count())
                .select_from(Usuario)
                .where(func.lower(Usuario.username) == username.lower())
            )
            assert iguais == 1
