"""Property 21: Consultas do Servico_Usuario normalizam e não alteram dados.

**Validates: Requirements 11.1, 11.2, 11.3, 4.12**

Para qualquer conjunto de Usuarios (1 a 4, criados em instantes diferentes):

- ``buscar_por_id(id)`` devolve o Perfil_Publico do Usuario com esse id (sem
  Hash_Senha) e ``None`` para qualquer string que não é id existente: vazia,
  texto qualquer, UUID desconhecido ou um id existente malformado (caractere a
  menos/a mais, hífen trocado, espaços nas pontas, dígito fora de hexadecimal),
  sem lançar exceção;
- ``buscar_usuario(variacao(email))`` devolve o Usuario dono do e-mail para
  qualquer variação de espaços nas pontas e de maiúsculas, e ``None`` para
  vazio, só espaços, e-mail não cadastrado, e-mail inválido ou valor que não é
  ``str``;
- ``GET /auth/email-em-uso`` devolve ``{"inUse": buscar_usuario(email) is not None}``;
- nenhuma dessas chamadas altera o banco: as linhas de ``usuario`` (inclusive
  ``atualizado_em``), ``sessao`` e ``token_redefinicao`` lidas antes e depois são
  idênticas, e a ``Session`` usada nas consultas termina sem objetos novos,
  alterados ou removidos.

Variações de caixa de um id existente (``ID.upper()``) não entram como "não id":
UUID não diferencia maiúsculas, e o serviço as aceita como o mesmo id.

Cada exemplo roda sobre uma cópia própria do banco-modelo.
"""

# Feature: autenticacao-conta, Property 21: Consultas do Servico_Usuario normalizam e não alteram dados

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import text

from app.autenticacao.servico import (
    buscar_por_id,
    buscar_usuario,
    criar_usuario,
    normalizar_email,
    para_perfil_publico,
)
from app.tests.estrategias import (
    emails_invalidos,
    emails_normalizados,
    emails_validos,
    nomes_validos,
    variacoes_de_email,
)

URL_EMAIL_EM_USO = "/api/v1/auth/email-em-uso"
SENHA = "senha-segura-1"
TABELAS = ("usuario", "sessao", "token_redefinicao")

_HEX = "0123456789abcdef"


def _instantaneo(ctx) -> dict[str, list[tuple]]:
    """Todas as linhas das três tabelas, lidas numa ``Session`` nova."""
    with ctx.sessao() as db:
        return {
            tabela: [tuple(linha) for linha in db.execute(text(f"SELECT * FROM {tabela} ORDER BY id"))]
            for tabela in TABELAS
        }


def _malformar(id_: str, modo: str, posicao: int, caractere: str) -> str:
    """Um id existente estragado de propósito (nunca casa com o formato UUID)."""
    i = posicao % len(id_)
    if modo == "remover":
        return id_[:i] + id_[i + 1:]
    if modo == "inserir":
        return id_[:i] + caractere + id_[i:]
    if modo == "sem_hifens":
        return id_.replace("-", "")
    if modo == "hifen_trocado":
        return id_.replace("-", "_", 1)
    if modo == "pontas":
        return f" {id_} "
    # "nao_hex": troca um dígito hexadecimal por uma letra fora de [0-9a-f]
    hexas = [k for k, c in enumerate(id_) if c in _HEX]
    k = hexas[posicao % len(hexas)]
    return id_[:k] + "g" + id_[k + 1:]


_MODOS_MALFORMADOS = ("remover", "inserir", "sem_hifens", "hifen_trocado", "pontas", "nao_hex")


@settings(max_examples=100, deadline=None)
@given(
    emails=st.lists(emails_normalizados(), min_size=1, max_size=4, unique=True),
    dados=st.data(),
)
def test_consultas_normalizam_e_nao_alteram_dados(criar_app_isolada, emails, dados):
    nomes = [dados.draw(nomes_validos(), label=f"nome_{i}") for i in range(len(emails))]
    cadastrados = set(emails)

    with criar_app_isolada() as ctx:
        # --- Usuarios em instantes diferentes --------------------------------
        esperados = {}  # id -> PerfilPublico esperado
        dono = {}  # email normalizado -> id
        with ctx.sessao() as db:
            for i, (email, nome) in enumerate(zip(emails, nomes, strict=True)):
                agora = ctx.relogio.avancar(minutes=7 * (i + 1), microseconds=i)
                usuario = criar_usuario(db, nome, email, SENHA, agora)
                db.refresh(usuario)
                esperados[usuario.id] = para_perfil_publico(usuario)
                dono[email] = usuario.id
        ids = set(esperados)
        ids_lista = sorted(ids)

        # --- Entradas geradas -----------------------------------------------
        variacoes = [
            (dados.draw(variacoes_de_email(email), label="variacao"), email)
            for email in emails
            for _ in range(2)
        ]
        nao_cadastrados = dados.draw(
            st.lists(
                st.one_of(
                    emails_validos().filter(lambda e: normalizar_email(e) not in cadastrados),
                    emails_invalidos(),
                    st.text(alphabet=" \t\n\u00a0", max_size=4),
                ),
                min_size=1,
                max_size=6,
            ),
            label="nao_cadastrados",
        )
        nao_ids = dados.draw(
            st.lists(
                st.one_of(
                    st.just(""),
                    st.text(max_size=40),
                    st.text(alphabet=_HEX + "-", min_size=30, max_size=40),
                    st.uuids().map(str),
                    st.builds(
                        _malformar,
                        st.sampled_from(ids_lista),
                        st.sampled_from(_MODOS_MALFORMADOS),
                        st.integers(min_value=0, max_value=100),
                        st.sampled_from(list(_HEX + "-x ")),
                    ),
                ).filter(lambda s: s.lower() not in ids),
                min_size=1,
                max_size=8,
            ),
            label="nao_ids",
        )
        nao_str = [None, 0, 42, b"ana@exemplo.com", ["ana@exemplo.com"]]

        antes = _instantaneo(ctx)

        # --- Consultas no serviço (Session fechada antes da API) ------------
        consultas_api = []  # (email, inUse esperado)
        with ctx.sessao() as db:
            for id_, perfil in esperados.items():
                obtido = buscar_por_id(db, id_)
                assert obtido == perfil, f"buscar_por_id({id_!r}) = {obtido!r}"
                campos = set(obtido.model_dump())
                assert not any("hash" in c or "senha" in c or "token" in c for c in campos)

            for id_ in nao_ids:
                assert buscar_por_id(db, id_) is None, f"buscar_por_id({id_!r}) não devolveu None"

            for variacao, email in variacoes:
                usuario = buscar_usuario(db, variacao)
                assert usuario is not None, f"buscar_usuario({variacao!r}) não achou {email!r}"
                assert usuario.id == dono[email]
                assert usuario.email == email
                consultas_api.append((variacao, True))

            for email in nao_cadastrados:
                assert buscar_usuario(db, email) is None, f"buscar_usuario({email!r}) achou alguém"
                consultas_api.append((email, False))

            for valor in nao_str:
                assert buscar_usuario(db, valor) is None
                assert buscar_por_id(db, valor) is None

            assert not db.new and not db.dirty and not db.deleted

        # --- Endpoint -------------------------------------------------------
        for email, em_uso in consultas_api:
            resposta = ctx.cliente.get(URL_EMAIL_EM_USO, params={"email": email})
            assert resposta.status_code == 200, (email, resposta.text)
            assert resposta.json() == {"inUse": em_uso}, (email, resposta.json())
        # Sem o parâmetro: e-mail vazio, não encontrado.
        resposta = ctx.cliente.get(URL_EMAIL_EM_USO)
        assert resposta.status_code == 200
        assert resposta.json() == {"inUse": False}

        # --- Nada mudou no banco --------------------------------------------
        depois = _instantaneo(ctx)
        assert depois == antes
        assert len(depois["usuario"]) == len(emails)
