"""Property 10: Validade de sessão segue exatamente a regra da Sessao_Valida.

Para qualquer Sessao, revogação opcional e instante de consulta ``t``,
``validar_sessao(token, t)`` devolve a Sessao se e somente se ``revogada_em``
está vazio e ``expira_em > t`` (``t == expira_em`` é inválido); qualquer string
que não é um token emitido devolve ``None``; uma Sessao revogada nunca volta a
ser válida, antes ou depois de ``expira_em``.

**Validates: Requirements 2.6, 9.7**
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from app.autenticacao.modelo import Sessao
from app.autenticacao.servico import (
    criar_sessao,
    criar_usuario,
    revogar_sessao,
    validar_sessao,
)
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import tokens_aleatorios

TTL_MAX = 525_600  # minutos (Requisito 2.8)
UM_MICRO = timedelta(microseconds=1)

# Fusos variados para ``t``: o instante é o mesmo, só a representação muda.
FUSOS = st.sampled_from([
    UTC,
    timezone(timedelta(hours=-3)),
    timezone(timedelta(hours=5, minutes=30)),
    timezone(timedelta(hours=-11, minutes=-45)),
])

ttls = st.one_of(
    st.sampled_from([1, 2, TTL_MAX - 1, TTL_MAX]),
    st.integers(min_value=1, max_value=TTL_MAX),
)

deslocamentos_criacao = st.timedeltas(
    min_value=timedelta(days=-3 * 365), max_value=timedelta(days=3 * 365)
)


@st.composite
def instantes_consulta(draw, criada_em: datetime, expira_em: datetime) -> list[datetime]:
    """Instantes ``t`` com a fronteira sempre presente (``expira_em`` e ±1 µs),
    mais pontos ao redor de ``criada_em`` e de ``expira_em``, em fusos variados."""
    fronteira = [expira_em - UM_MICRO, expira_em, expira_em + UM_MICRO]
    ttl = expira_em - criada_em
    perto = st.timedeltas(min_value=-timedelta(minutes=5), max_value=timedelta(minutes=5))
    longe = st.timedeltas(min_value=-2 * ttl - timedelta(days=1), max_value=2 * ttl + timedelta(days=1))
    extras = draw(st.lists(
        st.one_of(
            perto.map(lambda d: expira_em + d),
            perto.map(lambda d: criada_em + d),
            longe.map(lambda d: criada_em + d),
        ),
        max_size=6,
    ))
    return [t.astimezone(draw(FUSOS)) for t in fronteira + extras]


def _oraculo(revogada: bool, expira_em: datetime, t: datetime) -> bool:
    """Sessao_Valida: não revogada e ``expira_em`` estritamente depois de ``t``."""
    return not revogada and expira_em > t


@settings(max_examples=100, deadline=None)
@given(
    deslocamento=deslocamentos_criacao,
    ttl=ttls,
    dados=st.data(),
)
def test_validade_de_sessao_segue_regra_da_sessao_valida(
    criar_app_isolada, deslocamento, ttl, dados
):
    criada_em = INSTANTE_INICIAL + deslocamento
    expira_em = criada_em + timedelta(minutes=ttl)

    with criar_app_isolada() as ctx:
        with ctx.sessao() as db:
            usuario = criar_usuario(db, "Pessoa Teste", "pessoa@exemplo.com", "senha-segura-1", criada_em)
            sessao, token = criar_sessao(db, usuario, criada_em, ttl)
            sessao_id = sessao.id
            assert sessao.criada_em == criada_em
            assert sessao.expira_em == expira_em

        tokens_errados = dados.draw(
            st.lists(
                st.one_of(st.just(""), tokens_aleatorios()).filter(lambda x: x != token),
                min_size=1,
                max_size=4,
            ),
            label="tokens_errados",
        )

        def conferir(revogada: bool) -> None:
            instantes = dados.draw(instantes_consulta(criada_em, expira_em), label="instantes")
            with ctx.sessao() as db:
                for t in instantes:
                    resultado = validar_sessao(db, token, t)
                    if _oraculo(revogada, expira_em, t):
                        assert resultado is not None, f"t={t.isoformat()} deveria ser válida"
                        assert resultado.id == sessao_id
                    else:
                        assert resultado is None, f"t={t.isoformat()} deveria ser inválida"
                    for errado in tokens_errados:
                        assert validar_sessao(db, errado, t) is None

        # Antes de qualquer revogação: só a expiração decide.
        conferir(revogada=False)

        if dados.draw(st.booleans(), label="revogar"):
            revogada_em = criada_em + dados.draw(
                st.timedeltas(
                    min_value=timedelta(0),
                    max_value=timedelta(minutes=ttl) + timedelta(days=1),
                ),
                label="atraso_revogacao",
            )
            with ctx.sessao() as db:
                alvo = db.get(Sessao, sessao_id)
                revogar_sessao(db, alvo, revogada_em)
            # Depois de revogada, inválida para todo t (antes ou depois de expira_em).
            conferir(revogada=True)
