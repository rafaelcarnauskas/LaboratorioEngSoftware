"""Property 13: Revogação é idempotente.

**Validates: Requirements 2.7**

Para qualquer Sessao e qualquer sequência de revogações nos instantes
``t1, t2, ..., tn`` (os seguintes podem ser posteriores, iguais ou até anteriores
a ``t1``), depois de todas as chamadas a ``revogar_sessao``:

- ``revogada_em`` relido do banco numa ``Session`` nova é exatamente ``t1``;
- ``validar_sessao`` do Token_Sessao falha em ``t1``, em cada ``ti`` e em
  instantes posteriores ainda dentro do ``expira_em`` original.

Cada revogação depois da primeira usa uma de três formas de chegar à Sessao:

- ``mesma``: o mesmo objeto e a mesma ``Session`` da primeira revogação;
- ``nova``: uma cópia carregada numa ``Session`` nova, já com ``revogada_em``;
- ``antiga``: uma cópia carregada antes da primeira revogação, numa ``Session``
  mantida aberta, que ainda enxerga ``revogada_em`` vazio. Esta é a que exige o
  ``WHERE revogada_em IS NULL`` no próprio ``UPDATE``.

Cada exemplo roda sobre uma cópia própria do banco-modelo.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import select

from app.autenticacao.modelo import Sessao
from app.autenticacao.servico import (
    criar_sessao,
    criar_usuario,
    revogar_sessao,
    validar_sessao,
)

CRIADA_EM = datetime(2026, 2, 1, 8, 0, tzinfo=UTC)
TTL_MINUTOS = 7 * 24 * 60  # 7 dias: os instantes gerados ficam antes do expira_em
EXPIRA_EM = CRIADA_EM + timedelta(minutes=TTL_MINUTOS)

MODOS = ("mesma", "nova", "antiga")

# t1 entre a criação e um dia depois (com microssegundos).
_offset_t1 = st.integers(min_value=0, max_value=24 * 3600 * 10**6).map(
    lambda us: timedelta(microseconds=us)
)
# Deslocamento das revogações seguintes em relação a t1: de -1 dia a +2 dias,
# com peso extra para o próprio t1 e vizinhos imediatos.
_delta_seguinte = st.one_of(
    st.sampled_from([timedelta(0), timedelta(microseconds=1), timedelta(microseconds=-1)]),
    st.integers(min_value=-24 * 3600 * 10**6, max_value=2 * 24 * 3600 * 10**6).map(
        lambda us: timedelta(microseconds=us)
    ),
)
_revogacoes_seguintes = st.lists(
    st.tuples(_delta_seguinte, st.sampled_from(MODOS)), min_size=1, max_size=6
)
# Instantes posteriores a t1 (até o fim do segundo dia) para conferir a validação.
_depois_de_t1 = st.lists(
    st.integers(min_value=0, max_value=2 * 24 * 3600 * 10**6).map(
        lambda us: timedelta(microseconds=us)
    ),
    min_size=1,
    max_size=5,
)


def _carregar(db, sessao_id: str) -> Sessao:
    return db.scalars(select(Sessao).where(Sessao.id == sessao_id)).one()


@settings(max_examples=100, deadline=None)
@given(
    offset_t1=_offset_t1,
    seguintes=_revogacoes_seguintes,
    posteriores=_depois_de_t1,
)
def test_revogacao_e_idempotente(criar_app_isolada, offset_t1, seguintes, posteriores):
    t1 = CRIADA_EM + offset_t1
    instantes = [t1 + delta for delta, _ in seguintes]

    with criar_app_isolada() as ctx:
        abertas = []
        try:
            db = ctx.sessao()
            abertas.append(db)
            usuario = criar_usuario(
                db, "Ana", "ana@exemplo.com", "senha-segura-1", CRIADA_EM
            )
            sessao, token = criar_sessao(db, usuario, CRIADA_EM, TTL_MINUTOS)
            sessao_id = sessao.id
            assert sessao.revogada_em is None
            assert validar_sessao(db, token, t1) is not None  # válida antes de revogar

            # Cópias "antigas": carregadas antes da primeira revogação.
            antigas = []
            for _delta, modo in seguintes:
                if modo == "antiga":
                    db_antiga = ctx.sessao()
                    abertas.append(db_antiga)
                    copia = _carregar(db_antiga, sessao_id)
                    assert copia.revogada_em is None
                    antigas.append((db_antiga, copia))

            revogar_sessao(db, sessao, t1)

            for (_delta, modo), instante in zip(seguintes, instantes, strict=True):
                if modo == "mesma":
                    revogar_sessao(db, sessao, instante)
                elif modo == "nova":
                    with ctx.sessao() as db_nova:
                        revogar_sessao(db_nova, _carregar(db_nova, sessao_id), instante)
                else:
                    db_antiga, copia = antigas.pop(0)
                    revogar_sessao(db_antiga, copia, instante)
        finally:
            for aberta in abertas:
                aberta.close()

        with ctx.sessao() as db_leitura:
            relida = _carregar(db_leitura, sessao_id)
            assert relida.revogada_em == t1, (
                f"revogada_em={relida.revogada_em!r}, esperado t1={t1!r}"
            )
            assert relida.expira_em == EXPIRA_EM

            verificar = [t1, *instantes, *(t1 + d for d in posteriores)]
            for instante in verificar:
                assert validar_sessao(db_leitura, token, instante) is None, (
                    f"sessão revogada aceita em {instante!r}"
                )
