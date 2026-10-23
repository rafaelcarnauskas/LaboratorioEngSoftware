"""Property 3: E-mail e username são únicos sem diferenciar maiúsculas.

Para qualquer conjunto de Usuarios existentes e qualquer operação de cadastro
ou edição que use um e-mail cujo Email_Normalizado já pertence a outro Usuario,
ou um username cujo ``lower()`` já pertence a outro Usuario, a operação é
rejeitada com 409 e o estado de todos os Usuarios é idêntico ao anterior; e
para qualquer Usuario, editar o próprio username trocando apenas maiúsculas e
minúsculas é aceito.

Três testes:

- cadastro com uma variação (caixa e espaços) de um e-mail já cadastrado →
  ``409 email_em_uso``; as tabelas ``usuario``, ``sessao`` e
  ``token_redefinicao`` ficam idênticas e continua havendo um único Usuario
  com esse e-mail;
- edição com o username de outro Usuario em qualquer caixa (mesmo trocando
  também nome, descrição e foto) → ``409 username_em_uso`` sem alterar nada,
  nem ``atualizado_em`` (o relógio avança antes); o próprio username em outra
  caixa → 200, gravado com a caixa enviada;
- dois cadastros simultâneos com o mesmo Email_Normalizado (Requisito 4.7) →
  exatamente um 201 e um ``409 email_em_uso``, um Usuario e uma Sessao.

Oráculos independentes do código de produção: o Email_Normalizado é calculado
aqui como ``email.strip().lower()`` e a comparação de usernames como
``str.lower()``; o estado é lido direto das tabelas com SQL.

**Validates: Requisitos 1.3, 1.4, 4.7, 7.4**
"""

# Feature: autenticacao-conta, Property 3: E-mail e username são únicos sem diferenciar maiúsculas

from __future__ import annotations

import threading

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import text

from app.tests.estrategias import (
    descricoes_validas,
    emails_normalizados,
    foto_data_url,
    nomes_validos,
    senhas_validas,
    usernames_validos,
    variacoes_de_email,
)

URL_CADASTRO = "/api/v1/auth/cadastro"
URL_PERFIL = "/api/v1/usuarios/me"
SENHA = "senha-segura-1"
TABELAS = ("usuario", "sessao", "token_redefinicao")


def _instantaneo(ctx) -> dict[str, list[tuple]]:
    """Todas as linhas das três tabelas, lidas numa ``Session`` nova (já fechada)."""
    with ctx.sessao() as db:
        return {
            tabela: [tuple(linha) for linha in db.execute(text(f"SELECT * FROM {tabela} ORDER BY id"))]
            for tabela in TABELAS
        }


def _contar(ctx, sql: str, **params) -> int:
    with ctx.sessao() as db:
        return db.execute(text(sql), params).scalar_one()


def _cabecalho(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _cadastrar(ctx, email: str, nome: str = "Pessoa Teste") -> dict:
    resposta = ctx.cliente.post(
        URL_CADASTRO, json={"email": email, "name": nome, "password": SENHA}
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def _variacao_de_caixa(texto: str) -> st.SearchStrategy[str]:
    """Mesmo texto com maiúsculas e minúsculas trocadas aleatoriamente."""
    return st.lists(st.booleans(), min_size=len(texto), max_size=len(texto)).map(
        lambda trocar: "".join(c.swapcase() if t else c for c, t in zip(texto, trocar))
    )


fotos_pequenas = st.one_of(
    st.just(""),
    st.builds(foto_data_url, st.integers(min_value=0, max_value=256)),
)


# --- 1.3 / 4.7: cadastro com e-mail já cadastrado ---------------------------


@settings(max_examples=100, deadline=None)
@given(
    emails=st.lists(emails_normalizados(), min_size=1, max_size=4, unique=True),
    dados=st.data(),
)
def test_cadastro_com_email_existente_responde_409_sem_alterar_usuarios(
    criar_app_isolada, emails, dados
):
    alvo = dados.draw(st.sampled_from(emails), label="alvo")
    tentativa = dados.draw(variacoes_de_email(alvo), label="tentativa")
    nome = dados.draw(nomes_validos(), label="nome")
    senha = dados.draw(senhas_validas(), label="senha")
    assert tentativa.strip().lower() == alvo

    with criar_app_isolada() as ctx:
        for i, email in enumerate(emails):
            ctx.relogio.avancar(minutes=3 * (i + 1))
            _cadastrar(ctx, email)

        antes = _instantaneo(ctx)
        ctx.relogio.avancar(minutes=11)

        resposta = ctx.cliente.post(
            URL_CADASTRO, json={"email": tentativa, "name": nome, "password": senha}
        )

        assert resposta.status_code == 409, resposta.text
        corpo = resposta.json()
        assert corpo["error"]["code"] == "email_em_uso"
        assert "token" not in corpo and "user" not in corpo

        assert _instantaneo(ctx) == antes
        assert _contar(ctx, "SELECT COUNT(*) FROM usuario WHERE email = :e", e=alvo) == 1


# --- 1.4 / 7.4: edição de perfil com username de outro Usuario --------------


@settings(max_examples=100, deadline=None)
@given(
    emails=st.lists(emails_normalizados(), min_size=2, max_size=4, unique=True),
    dados=st.data(),
)
def test_edicao_com_username_de_outro_responde_409_e_propria_caixa_e_aceita(
    criar_app_isolada, emails, dados
):
    with criar_app_isolada() as ctx:
        # Usuarios pelo cadastro; cada um guarda o token e o username derivado.
        tokens, derivados = [], []
        for i, email in enumerate(emails):
            ctx.relogio.avancar(minutes=3 * (i + 1))
            sessao = _cadastrar(ctx, email)
            tokens.append(sessao["token"])
            derivados.append(sessao["user"]["username"])

        # Usernames escolhidos (caixa mista), únicos por lower() e sem colidir
        # com os derivados ainda não trocados.
        derivados_lower = {u.lower() for u in derivados}
        usernames = dados.draw(
            st.lists(
                usernames_validos().filter(lambda u: u.lower() not in derivados_lower),
                min_size=len(emails),
                max_size=len(emails),
                unique_by=str.lower,
            ),
            label="usernames",
        )
        for token, username in zip(tokens, usernames, strict=True):
            ctx.relogio.avancar(minutes=1)
            resposta = ctx.cliente.patch(
                URL_PERFIL,
                headers=_cabecalho(token),
                json={"name": "Pessoa Teste", "username": username, "description": "", "photo": ""},
            )
            assert resposta.status_code == 200, resposta.text

        indices = list(range(len(emails)))
        a = dados.draw(st.sampled_from(indices), label="editor")
        b = dados.draw(st.sampled_from([i for i in indices if i != a]), label="dono")
        username_de_b = dados.draw(_variacao_de_caixa(usernames[b]), label="username_de_b")
        assert username_de_b.lower() == usernames[b].lower()
        nome = dados.draw(nomes_validos(), label="nome")
        descricao = dados.draw(descricoes_validas(), label="descricao")
        foto = dados.draw(fotos_pequenas, label="foto")

        # --- Username de outro Usuario em qualquer caixa → 409 sem efeito ---
        antes = _instantaneo(ctx)
        ctx.relogio.avancar(minutes=5)
        resposta = ctx.cliente.patch(
            URL_PERFIL,
            headers=_cabecalho(tokens[a]),
            json={"name": nome, "username": username_de_b, "description": descricao, "photo": foto},
        )
        assert resposta.status_code == 409, resposta.text
        assert resposta.json()["error"]["code"] == "username_em_uso"
        assert _instantaneo(ctx) == antes

        # --- O próprio username com outra caixa → aceito --------------------
        proprio = dados.draw(_variacao_de_caixa(usernames[a]), label="proprio")
        ctx.relogio.avancar(minutes=5)
        resposta = ctx.cliente.patch(
            URL_PERFIL,
            headers=_cabecalho(tokens[a]),
            json={"name": nome, "username": proprio, "description": descricao, "photo": foto},
        )
        assert resposta.status_code == 200, resposta.text
        perfil = resposta.json()
        assert perfil["username"] == proprio

        with ctx.sessao() as db:
            linhas = db.execute(
                text("SELECT id, username, username_normalizado FROM usuario")
            ).all()
        por_id = {id_: (username, normalizado) for id_, username, normalizado in linhas}
        assert por_id[perfil["id"]] == (proprio, proprio.lower())
        # Os usernames continuam únicos sem diferenciar caixa.
        normalizados = [u.lower() for u, _ in por_id.values()]
        assert len(set(normalizados)) == len(normalizados)
        # Os demais Usuarios não mudaram.
        linhas_antes = {linha[0]: linha for linha in antes["usuario"]}
        with ctx.sessao() as db:
            linhas_depois = {
                linha[0]: tuple(linha)
                for linha in db.execute(text("SELECT * FROM usuario ORDER BY id"))
            }
        for id_, linha in linhas_antes.items():
            if id_ != perfil["id"]:
                assert linhas_depois[id_] == linha


# --- 4.7: dois cadastros simultâneos com o mesmo e-mail ---------------------


@settings(max_examples=100, deadline=None)
@given(email=emails_normalizados(), dados=st.data())
def test_cadastros_simultaneos_com_mesmo_email_criam_um_so_usuario(
    criar_app_isolada, email, dados
):
    variacoes = [dados.draw(variacoes_de_email(email), label=f"variacao_{i}") for i in range(2)]
    nomes = [dados.draw(nomes_validos(), label=f"nome_{i}") for i in range(2)]

    with criar_app_isolada() as ctx:
        clientes = [ctx.novo_cliente(), ctx.novo_cliente()]
        barreira = threading.Barrier(2)
        respostas: list = [None, None]
        falhas: list[BaseException] = []

        def enviar(i: int) -> None:
            try:
                barreira.wait(timeout=10)
                respostas[i] = clientes[i].post(
                    URL_CADASTRO,
                    json={"email": variacoes[i], "name": nomes[i], "password": SENHA},
                )
            except BaseException as erro:  # noqa: BLE001 - repassado ao teste
                falhas.append(erro)

        threads = [threading.Thread(target=enviar, args=(i,)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert not any(t.is_alive() for t in threads), "cadastro simultâneo travou"
        assert not falhas, falhas

        status = sorted(r.status_code for r in respostas)
        assert status == [201, 409], [r.text for r in respostas]
        criado = next(r for r in respostas if r.status_code == 201).json()
        recusado = next(r for r in respostas if r.status_code == 409).json()
        assert recusado["error"]["code"] == "email_em_uso"
        assert criado["user"]["email"] == email

        with ctx.sessao() as db:
            usuarios = db.execute(text("SELECT id, email FROM usuario")).all()
            sessoes = db.execute(text("SELECT usuario_id FROM sessao")).all()
        assert [tuple(u) for u in usuarios] == [(criado["user"]["id"], email)]
        assert [s[0] for s in sessoes] == [criado["user"]["id"]]
