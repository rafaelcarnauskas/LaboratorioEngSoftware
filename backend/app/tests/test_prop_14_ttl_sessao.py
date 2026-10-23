"""Property 14: Expiração da sessão respeita o TTL configurado.

**Validates: Requirements 2.5**

Para qualquer TTL inteiro em 1..525600 e qualquer instante de criação, a Sessao
criada tem ``expira_em - criada_em == TTL minutos``, exatamente.

O TTL entra pelo mesmo caminho da produção: ``CHOOSEN_SESSION_TTL_MINUTES`` no
ambiente → ``create_app()`` → ``app.state.config.session_ttl_minutes`` →
``criar_sessao(db, usuario, agora, ttl)``. Os endpoints de login e cadastro ainda
não existem, então a Sessao é criada direto no serviço. Cada exemplo roda sobre
uma cópia própria do banco-modelo, e os valores são conferidos tanto no objeto
devolvido quanto relidos do banco numa ``Session`` nova.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

from hypothesis import given, settings
from hypothesis import strategies as st

from app.autenticacao.modelo import Sessao
from app.autenticacao.servico import criar_sessao, criar_usuario

TTL_MIN = 1
TTL_MAX = 525600  # Requisito 2.5
TTL_PADRAO = 10080  # 7 dias

# --- Geradores ----------------------------------------------------------------

# TTL em todo o intervalo, com os extremos e o padrão sempre representados.
ttls = st.one_of(
    st.sampled_from([TTL_MIN, TTL_MAX, TTL_PADRAO]),
    st.integers(min_value=TTL_MIN, max_value=TTL_MAX),
)

# Fusos fixos de -14h a +14h: o instante pode chegar em qualquer fuso; o banco
# grava em UTC.
fusos = st.integers(min_value=-14 * 60, max_value=14 * 60).map(
    lambda minutos: timezone(timedelta(minutes=minutos))
)

# Instantes com microssegundos, longe o bastante de datetime.max para que
# ``agora + TTL_MAX`` não estoure.
instantes = st.datetimes(
    min_value=datetime(1971, 1, 1),
    max_value=datetime(2999, 12, 31, 23, 59, 59, 999999),
    timezones=fusos,
)


def _criar_sessao_com_config(ctx, agora: datetime) -> tuple[str, datetime, datetime]:
    """Cria um Usuario e uma Sessao com o TTL de ``ctx.config``; devolve o id da
    Sessao e os ``criada_em``/``expira_em`` do objeto devolvido."""
    ttl = ctx.config.session_ttl_minutes
    with ctx.sessao() as db:
        usuario = criar_usuario(db, "Fulano de Tal", "fulano@exemplo.com", "senha-valida-123", agora)
        sessao, token = criar_sessao(db, usuario, agora, ttl)
        assert token
        return sessao.id, sessao.criada_em, sessao.expira_em


def _reler(ctx, sessao_id: str) -> Sessao:
    with ctx.sessao() as db:
        sessao = db.get(Sessao, sessao_id)
        assert sessao is not None
        db.expunge(sessao)
        return sessao


# --- Propriedade ----------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(ttl=ttls, agora=instantes)
def test_expira_em_menos_criada_em_e_exatamente_o_ttl_configurado(criar_app_isolada, ttl, agora):
    with criar_app_isolada(ambiente={"CHOOSEN_SESSION_TTL_MINUTES": str(ttl)}) as ctx:
        # A variável de ambiente chega à configuração da app.
        assert ctx.config.session_ttl_minutes == ttl

        sessao_id, criada_em, expira_em = _criar_sessao_com_config(ctx, agora)
        assert criada_em == agora
        assert expira_em - criada_em == timedelta(minutes=ttl)

        # Persistido: relido do banco numa Session nova (em UTC).
        relida = _reler(ctx, sessao_id)
        assert relida.criada_em.utcoffset() == timedelta(0)
        assert relida.criada_em == agora
        assert relida.expira_em == agora + timedelta(minutes=ttl)
        assert relida.expira_em - relida.criada_em == timedelta(minutes=ttl)


# --- Exemplo: TTL padrão ------------------------------------------------------


def test_sem_variavel_o_ttl_e_10080_minutos(criar_app_isolada):
    agora = datetime(2026, 3, 1, 8, 15, 30, 123456, tzinfo=UTC)
    with criar_app_isolada() as ctx:
        assert ctx.config.session_ttl_minutes == TTL_PADRAO

        sessao_id, _, _ = _criar_sessao_com_config(ctx, agora)
        relida = _reler(ctx, sessao_id)
        assert relida.expira_em - relida.criada_em == timedelta(days=7)
