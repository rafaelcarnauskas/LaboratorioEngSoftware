"""Property 11: Endpoint protegido sem Sessao_Valida responde 401 sem efeito.

Para qualquer Endpoint_Protegido da Parte 1 (``POST /auth/logout``,
``GET /usuarios/me``, ``PATCH /usuarios/me``, ``PUT /usuarios/me/senha``) e
qualquer cabeçalho ``Authorization`` ausente, fora do formato
``Bearer <token>``, com token vazio, desconhecido, revogado ou expirado, a
resposta tem status 401, cabeçalho ``WWW-Authenticate: Bearer``,
``error.code == "sessao_invalida"``, nenhum dado de Usuario no corpo, e o
conteúdo do banco (as três tabelas, inclusive ``revogada_em`` das Sessoes já
revogadas) é idêntico ao anterior.

Os corpos enviados ao PATCH e ao PUT seriam aceitos (e gravariam algo) com uma
Sessao_Valida, ou são inválidos/ausentes: o 401 tem de vir antes de qualquer
validação ou escrita. No fim, o token da Sessao_Valida do mesmo banco ainda
funciona (controle positivo: os 401 não vêm de um app quebrado).

Só os endpoints da Parte 1 entram aqui; os routers ``comunidades`` e
``historico`` dos colegas ainda não são protegidos pela Parte 1.

**Validates: Requirements 10.2, 7.9, 9.8, 9.9**
"""

from __future__ import annotations

from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import inspect, text

from app.autenticacao.api import CODIGO_SESSAO_INVALIDA, MSG_SESSAO_INVALIDA
from app.autenticacao.modelo import TokenRedefinicao
from app.autenticacao.servico import (
    VALIDADE_TOKEN_REDEFINICAO,
    criar_sessao,
    criar_usuario,
    revogar_sessao,
)
from app.core import seguranca
from app.tests.conftest import INSTANTE_INICIAL
from app.tests.estrategias import (
    descricoes_validas,
    nomes_validos,
    senhas_validas,
    tokens_aleatorios,
    usernames_validos,
)

AGORA = INSTANTE_INICIAL
TTL_VALIDA = 7 * 24 * 60  # minutos
SENHA_ANA = "senha-da-ana-1"
SENHA_BRUNO = "senha-do-bruno-1"

ENDPOINTS = (
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/usuarios/me"),
    ("PATCH", "/api/v1/usuarios/me"),
    ("PUT", "/api/v1/usuarios/me/senha"),
)

# Casos de Authorization; os que levam token são resolvidos com os tokens do banco.
CASOS = (
    "ausente",            # sem cabeçalho
    "esquema_errado",     # "<Outro> <token válido>"
    "so_token",           # "<token válido>" sem esquema
    "colado",             # "Bearer<token válido>" sem espaço
    "vazio",              # "Bearer", "Bearer ", "Bearer   "
    "desconhecido",       # "Bearer <token aleatório>"
    "token_redefinicao",  # "Bearer <Token_Redefinicao válido>"
    "revogado",           # "Bearer <token de Sessao revogada>"
    "expirado",           # "Bearer <token de Sessao com expira_em <= agora>"
    "expirado_relogio",   # token da Sessao_Valida com o relógio em expira_em ou depois
)

ESQUEMAS_BEARER = st.sampled_from(["Bearer", "bearer", "BEARER", "BeArEr"])
ESQUEMAS_ERRADOS = st.one_of(
    st.sampled_from(["Basic", "Token", "Digest", "JWT", "Bearer:", "Bearer-", "Bearerx", "OAuth"]),
    st.text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", min_size=1, max_size=10)
    .filter(lambda s: s.lower() != "bearer"),
)

# Atrasos de no máximo alguns dias, com a fronteira exata (0) em destaque.
_atrasos = st.one_of(
    st.just(timedelta(0)),
    st.just(timedelta(microseconds=1)),
    st.integers(min_value=0, max_value=3 * 24 * 3600 * 10**6).map(lambda us: timedelta(microseconds=us)),
)


@st.composite
def corpos(draw, metodo: str, caminho: str):
    """Corpo JSON da requisição (``None`` = sem corpo)."""
    if metodo == "GET":
        return None
    if metodo == "POST":  # logout: sem corpo ou com um JSON qualquer
        return draw(st.sampled_from([None, {}, {"qualquer": "coisa"}]))
    if caminho.endswith("/senha"):
        return draw(st.one_of(
            # Senha atual correta e nova válida: com sessão, trocaria o Hash_Senha.
            senhas_validas().map(lambda nova: {"currentPassword": SENHA_ANA, "newPassword": nova}),
            st.sampled_from([None, {}, {"currentPassword": 1, "newPassword": None}]),
            st.just({"currentPassword": SENHA_ANA, "newPassword": "curta"}),
        ))
    # PATCH /usuarios/me
    validos = st.fixed_dictionaries({
        "name": nomes_validos(),
        "username": usernames_validos(),
        "description": st.one_of(st.none(), descricoes_validas()),
        "photo": st.sampled_from([None, "", "data:image/png;base64,QUJD"]),
    })
    return draw(st.one_of(
        validos,
        st.sampled_from([None, {}, {"name": 1, "username": [], "description": 2, "photo": 3}]),
    ))


@st.composite
def requisicoes(draw):
    metodo, caminho = draw(st.sampled_from(ENDPOINTS))
    caso = draw(st.sampled_from(CASOS))
    return {
        "metodo": metodo,
        "caminho": caminho,
        "caso": caso,
        "corpo": draw(corpos(metodo, caminho)),
        "esquema_bearer": draw(ESQUEMAS_BEARER),
        "esquema_errado": draw(ESQUEMAS_ERRADOS),
        "espacos": draw(st.sampled_from(["", " ", "   "])),
        "aleatorio": draw(tokens_aleatorios()),
        "atraso": draw(_atrasos),
    }


def _foto_do_banco(engine) -> dict[str, list[tuple]]:
    """Todas as linhas de todas as tabelas, com os valores crus do SQLite."""
    nomes = sorted(inspect(engine).get_table_names())
    foto: dict[str, list[tuple]] = {}
    with engine.connect() as conexao:
        for nome in nomes:
            linhas = conexao.execute(text(f'SELECT * FROM "{nome}"')).all()
            foto[nome] = sorted((tuple(linha) for linha in linhas), key=repr)
    return foto


def _cabecalho(req: dict, tokens: dict[str, str]) -> str | None:
    caso = req["caso"]
    valido = tokens["valido"]
    if caso == "ausente":
        return None
    if caso == "esquema_errado":
        return f"{req['esquema_errado']} {valido}"
    if caso == "so_token":
        return valido
    if caso == "colado":
        return f"Bearer{valido}"
    if caso == "vazio":
        return f"{req['esquema_bearer']}{req['espacos']}"
    if caso == "desconhecido":
        return f"{req['esquema_bearer']} {req['aleatorio']}"
    if caso == "expirado_relogio":
        return f"{req['esquema_bearer']} {valido}"
    return f"{req['esquema_bearer']} {tokens[caso]}"


@settings(max_examples=100, deadline=None)
@given(
    revogado_da_ana=st.booleans(),
    expirado_da_ana=st.booleans(),
    atraso_revogacao=_atrasos,
    ttl_expirada=st.integers(min_value=1, max_value=600),
    atraso_expiracao=_atrasos,
    lista=st.lists(requisicoes(), min_size=1, max_size=4),
)
def test_endpoint_protegido_sem_sessao_valida_responde_401_sem_efeito(
    criar_app_isolada,
    revogado_da_ana,
    expirado_da_ana,
    atraso_revogacao,
    ttl_expirada,
    atraso_expiracao,
    lista,
):
    with criar_app_isolada() as ctx:
        # --- Banco: dois Usuarios, Sessao válida, revogada e expirada, Token_Redefinicao.
        with ctx.sessao() as db:
            ana = criar_usuario(db, "Ana Protegida", "ana.protegida@exemplo.com", SENHA_ANA,
                                AGORA - timedelta(days=10))
            bruno = criar_usuario(db, "Bruno Protegido", "bruno.protegido@exemplo.com",
                                  SENHA_BRUNO, AGORA - timedelta(days=10))
            dados_usuarios = [
                (u.id, u.email, u.username, u.nome) for u in (ana, bruno)
            ]

            valida, token_valido = criar_sessao(db, ana, AGORA - timedelta(hours=1), TTL_VALIDA)
            expira_valida = valida.expira_em

            dono_revogada = ana if revogado_da_ana else bruno
            revogada, token_revogado = criar_sessao(
                db, dono_revogada, AGORA - timedelta(days=4), TTL_VALIDA
            )
            # Revogada antes de agora e ainda dentro do expira_em original.
            revogar_sessao(db, revogada, AGORA - atraso_revogacao)

            dono_expirada = ana if expirado_da_ana else bruno
            # expira_em = AGORA - atraso_expiracao <= AGORA (atraso 0: exatamente agora).
            _expirada, token_expirado = criar_sessao(
                db, dono_expirada,
                AGORA - atraso_expiracao - timedelta(minutes=ttl_expirada), ttl_expirada,
            )

            token_redefinicao = seguranca.gerar_token()
            db.add(TokenRedefinicao(
                usuario_id=ana.id,
                token_hash=seguranca.hash_token(token_redefinicao),
                criado_em=AGORA - timedelta(minutes=1),
                expira_em=AGORA - timedelta(minutes=1) + VALIDADE_TOKEN_REDEFINICAO,
                usado_em=None,
                invalidado_em=None,
            ))
            db.commit()

        tokens = {
            "valido": token_valido,
            "revogado": token_revogado,
            "expirado": token_expirado,
            "token_redefinicao": token_redefinicao,
        }
        tokens_emitidos = set(tokens.values())
        antes = _foto_do_banco(ctx.engine)
        assert antes["sessao"] and antes["token_redefinicao"] and len(antes["usuario"]) == 2

        for req in lista:
            if req["caso"] == "desconhecido" and req["aleatorio"] in tokens_emitidos:
                continue  # probabilidade desprezível; não é "desconhecido"
            cabecalho = _cabecalho(req, tokens)
            headers = {} if cabecalho is None else {"Authorization": cabecalho}

            ctx.relogio.definir(
                expira_valida + req["atraso"] if req["caso"] == "expirado_relogio" else AGORA
            )
            kwargs = {"headers": headers}
            if req["corpo"] is not None:
                kwargs["json"] = req["corpo"]
            resposta = ctx.cliente.request(req["metodo"], req["caminho"], **kwargs)
            ctx.relogio.definir(AGORA)

            contexto = f"{req['metodo']} {req['caminho']} caso={req['caso']} Authorization={cabecalho!r}"
            assert resposta.status_code == 401, f"{contexto}: {resposta.status_code} {resposta.text}"
            assert resposta.headers.get("www-authenticate") == "Bearer", contexto
            corpo = resposta.json()
            assert set(corpo) == {"error"}, contexto
            assert corpo["error"]["code"] == CODIGO_SESSAO_INVALIDA, contexto
            assert corpo["error"]["message"] == MSG_SESSAO_INVALIDA, contexto
            assert set(corpo["error"]) <= {"code", "message", "fields"}, contexto
            # Nenhum dado de Usuario nem token no corpo.
            for valores in dados_usuarios:
                for valor in valores:
                    assert valor not in resposta.text, f"{contexto}: vazou {valor!r}"
            for token in tokens_emitidos:
                assert token not in resposta.text, contexto

            depois = _foto_do_banco(ctx.engine)
            assert depois == antes, f"{contexto}: o banco mudou"

        # Controle positivo: a Sessao_Valida continua aceita no mesmo app.
        resposta = ctx.cliente.get(
            "/api/v1/usuarios/me", headers={"Authorization": f"Bearer {token_valido}"}
        )
        assert resposta.status_code == 200, resposta.text
        assert resposta.json()["id"] == dados_usuarios[0][0]
        assert _foto_do_banco(ctx.engine) == antes
