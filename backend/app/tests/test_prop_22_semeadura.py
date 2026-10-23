"""Property 22: Semeadura é idempotente e restaura o Usuario_Demonstracao.

**Validates: Requisitos 14.2, 14.3**

Para qualquer estado prévio do Usuario ``victor@email.com`` (ausente, ou com
nome, username, flags de administração e senha alterados, e e-mail com caixa
diferente), executar ``main()`` de ``app.autenticacao.semear`` em development
uma a três vezes deixa exatamente um Usuario com esse e-mail, com e-mail
``victor@email.com``, nome ``Victor Mendes``, username ``victor``, os dois flags
verdadeiros e Hash_Senha que confere com ``choosen123``. O ``id`` do Usuario já
existente é mantido e os outros Usuarios não mudam.

Os estados gerados também cobrem as recusas, que precisam deixar o banco
exatamente como estava e devolver código 1 em todas as execuções:

- ``CHOOSEN_ENV`` diferente de ``development`` (14.4);
- username ``victor`` (em qualquer caixa) pertencente a outra conta.

Cada exemplo roda sobre uma cópia própria do banco-modelo; ``main()`` é chamado
direto (sem subprocesso) com ``CHOOSEN_ENV`` e ``CHOOSEN_DATABASE_URL``
apontando para a cópia.
"""

from __future__ import annotations

import contextlib
import io
import string
from datetime import UTC, datetime

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import func, select

from app.autenticacao import semear
from app.autenticacao.modelo import Usuario
from app.core.seguranca import gerar_hash_senha, verificar_senha

EMAIL = "victor@email.com"
CRIADO_EM = datetime(2025, 6, 1, 9, 30, tzinfo=UTC)

_ALFABETO_USERNAME = string.ascii_letters + string.digits + "._"


def _variacao_de_caixa(texto: str) -> st.SearchStrategy[str]:
    """``texto`` com cada letra em maiúscula ou minúscula, ao acaso."""
    return st.lists(st.booleans(), min_size=len(texto), max_size=len(texto)).map(
        lambda maiusculas: "".join(
            c.upper() if m else c.lower() for c, m in zip(texto, maiusculas, strict=True)
        )
    )


_usernames_comuns = st.text(alphabet=_ALFABETO_USERNAME, min_size=3, max_size=30).filter(
    lambda u: u.lower() != semear.USERNAME_DEMONSTRACAO
)

_victor_previo = st.fixed_dictionaries(
    {
        "email": _variacao_de_caixa(EMAIL),
        "nome": st.text(min_size=1, max_size=60).map(str.strip).filter(bool),
        # "victor" em outra caixa ou um username qualquer.
        "username": st.one_of(_variacao_de_caixa(semear.USERNAME_DEMONSTRACAO), _usernames_comuns),
        "is_community_admin": st.booleans(),
        "is_system_admin": st.booleans(),
        "senha": st.text(min_size=0, max_size=40),
    }
)


@st.composite
def estados_previos(draw):
    victor = draw(st.none() | _victor_previo)
    usernames_outros = draw(
        st.lists(_usernames_comuns, max_size=3, unique_by=str.lower)
    )
    if victor is not None:
        # Os outros não podem repetir o username do victor (unicidade no banco).
        usernames_outros = [u for u in usernames_outros if u.lower() != victor["username"].lower()]
    outros = [
        {"email": f"outro{i}@exemplo.com", "username": u, "nome": f"Outro {i}"}
        for i, u in enumerate(usernames_outros)
    ]

    # Conflito só é possível se o victor (quando existe) não usa "victor".
    victor_livre = victor is None or victor["username"].lower() != semear.USERNAME_DEMONSTRACAO
    conflito = victor_livre and draw(st.booleans())
    if conflito:
        outros.append(
            {
                "email": "dono.do.victor@exemplo.com",
                "username": draw(_variacao_de_caixa(semear.USERNAME_DEMONSTRACAO)),
                "nome": "Dono do victor",
            }
        )

    ambiente = draw(
        st.sampled_from(["development"] * 3 + ["test", "production"])
    )
    execucoes = draw(st.integers(min_value=1, max_value=3))
    return victor, outros, conflito, ambiente, execucoes


def _novo_usuario(email: str, username: str, nome: str, senha: str,
                  community: bool = False, system: bool = False) -> Usuario:
    # Gravado direto, sem o serviço: permite e-mail fora do Email_Normalizado.
    return Usuario(
        email=email,
        username=username,
        username_normalizado=username.lower(),
        hash_senha=gerar_hash_senha(senha),
        nome=nome,
        descricao="",
        foto="",
        is_community_admin=community,
        is_system_admin=system,
        criado_em=CRIADO_EM,
        atualizado_em=CRIADO_EM,
    )


_COLUNAS = [c.key for c in Usuario.__table__.columns]


def _retrato(db) -> list[tuple]:
    """Todas as colunas de todos os Usuarios, ordenadas por ``id``."""
    return [
        tuple(getattr(u, c) for c in _COLUNAS)
        for u in db.scalars(select(Usuario).order_by(Usuario.id))
    ]


def _executar_main(ctx, ambiente: str) -> tuple[int, str, str]:
    saida, erro = io.StringIO(), io.StringIO()
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("CHOOSEN_ENV", ambiente)
        mp.setenv("CHOOSEN_DATABASE_URL", ctx.url)
        with contextlib.redirect_stdout(saida), contextlib.redirect_stderr(erro):
            codigo = semear.main()
    return codigo, saida.getvalue(), erro.getvalue()


# Cada exemplo copia o banco, grava até 5 Usuarios e roda main() até 3 vezes
# (cada execução abre um engine novo); com o Argon2 rápido dos testes isso fica
# em poucos décimos de segundo, então os 100 exemplos cabem.
@settings(max_examples=100, deadline=None)
@given(estado=estados_previos())
def test_semeadura_idempotente_restaura_demonstracao(criar_app_isolada, estado):
    victor, outros, conflito, ambiente, execucoes = estado

    with criar_app_isolada() as ctx:
        with ctx.sessao() as db:
            id_victor = None
            if victor is not None:
                usuario = _novo_usuario(
                    victor["email"], victor["username"], victor["nome"], victor["senha"],
                    victor["is_community_admin"], victor["is_system_admin"],
                )
                db.add(usuario)
            for o in outros:
                db.add(_novo_usuario(o["email"], o["username"], o["nome"], "senha-outro-1"))
            db.commit()
            if victor is not None:
                id_victor = usuario.id
            antes = _retrato(db)
            outros_antes = [
                linha for linha in antes if linha[_COLUNAS.index("id")] != id_victor
            ]
        # Sessão fechada antes de main(): o SQLite não fica com transação aberta.

        recusa = ambiente != "development" or conflito
        for n in range(execucoes):
            codigo, saida, erro = _executar_main(ctx, ambiente)

            if ambiente != "development":
                assert codigo == 1, f"execução {n + 1}: código {codigo} fora de development"
                assert erro.strip() == semear.MSG_AMBIENTE_RECUSADO
                assert saida == ""
            elif conflito:
                assert codigo == 1, f"execução {n + 1}: código {codigo} com username em conflito"
                assert erro.strip() == semear.MSG_USERNAME_EM_CONFLITO.format(
                    email="dono.do.victor@exemplo.com"
                )
                assert saida == ""
            else:
                assert codigo == 0, f"execução {n + 1}: código {codigo}, stderr={erro!r}"
                esperado = (
                    semear.MSG_CRIADO if n == 0 and victor is None else semear.MSG_RESTAURADO
                )
                assert saida.strip() == esperado
                assert erro == ""

        with ctx.sessao() as db:
            depois = _retrato(db)
            if recusa:
                assert depois == antes, "a recusa alterou o banco"
                return

            demonstracao = list(
                db.scalars(
                    select(Usuario).where(func.lower(func.trim(Usuario.email)) == EMAIL)
                )
            )
            assert len(demonstracao) == 1, f"{len(demonstracao)} Usuarios com {EMAIL}"
            u = demonstracao[0]
            if id_victor is not None:
                assert u.id == id_victor, "a restauração criou outro registro"
            assert u.email == EMAIL
            assert u.nome == semear.NOME_DEMONSTRACAO
            assert u.username == semear.USERNAME_DEMONSTRACAO
            assert u.username_normalizado == semear.USERNAME_DEMONSTRACAO
            assert u.is_community_admin is True
            assert u.is_system_admin is True
            assert u.hash_senha != semear.SENHA_DEMONSTRACAO
            assert verificar_senha(u.hash_senha, semear.SENHA_DEMONSTRACAO)

            assert len(depois) == len(outros) + 1
            outros_depois = [
                linha for linha in depois if linha[_COLUNAS.index("id")] != u.id
            ]
            assert outros_depois == outros_antes, "a semeadura alterou outros Usuarios"
