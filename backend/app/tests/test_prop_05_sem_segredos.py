"""Property 5: Nenhum segredo é persistido em texto claro.

**Validates: Requirements 1.5, 2.4, 5.3**

Para qualquer sequência de cadastros, logins, trocas de senha, pedidos e
confirmações de redefinição (intercalados com edições de perfil, leituras de
``/usuarios/me`` e logouts), nenhuma célula de nenhuma tabela do banco contém
como substring qualquer senha enviada (certa ou errada), qualquer Token_Sessao
devolvido ou qualquer Token_Redefinicao gerado; e, para cada token, existe
exatamente uma linha cujo ``token_hash == hash_token(token)`` (na tabela
certa).

Oráculos, depois da sequência:

1. ``SELECT *`` em toda tabela de ``sqlite_master`` (SQL cru, sem ORM): nenhuma
   célula contém um segredo.
2. Os bytes crus do arquivo SQLite (e de ``-journal``/``-wal``, se existirem),
   lidos depois de ``engine.dispose()``: nenhum segredo aparece, nem em páginas
   livres (o que pega um valor gravado em claro e depois sobrescrito).
3. Respostas HTTP (corpo cru, strings do JSON decodificado e cabeçalhos):
   nenhuma contém Hash_Senha, ``token_hash``, ``$argon2``, senha ou
   Token_Redefinicao; um Token_Sessao só aparece na resposta que o criou.

Os Tokens_Redefinicao em claro são capturados trocando
``app.core.seguranca.gerar_token`` por um invólucro (o serviço chama o gerador
pelo atributo do módulo); os gerados que não voltaram como Token_Sessao são os
de redefinição.

Coincidências: tokens têm 43 caracteres aleatórios e são sempre verificados.
Senhas têm de 8 a 128 caracteres, mas o Hypothesis gera muito texto repetitivo
(``"00000000"``, ``"\\x00" * 8``) que aparece por acaso em datas, UUIDs ou nos
bytes zerados do arquivo. Por isso uma senha só entra no oráculo se tiver pelo
menos 4 caracteres distintos, se não for substring de um dado público enviado
ou devolvido (e-mail, nome, username, descrição, id; o banco guarda esses em
claro de propósito) e, para a varredura do arquivo, se não aparecer já no
banco-modelo vazio (esquema SQL, versão do Alembic) e tiver ao menos 4
caracteres imprimíveis distintos. As senhas descartadas são contadas com
``hypothesis.event``.

Cada exemplo roda sobre uma cópia própria do banco-modelo.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from hypothesis import event, given, settings
from hypothesis import strategies as st
from sqlalchemy import text

from app.core import seguranca
from app.tests.estrategias import (
    descricoes_validas,
    emails_normalizados,
    nomes_validos,
    senhas_validas,
    tokens_aleatorios,
)

API = "/api/v1"
URL_CADASTRO = f"{API}/auth/cadastro"
URL_LOGIN = f"{API}/auth/login"
URL_LOGOUT = f"{API}/auth/logout"
URL_PEDIDO = f"{API}/auth/redefinicao-senha"
URL_CONFIRMACAO = f"{API}/auth/redefinicao-senha/confirmacao"
URL_ME = f"{API}/usuarios/me"
URL_SENHA = f"{API}/usuarios/me/senha"

HEX_64 = re.compile(r"[0-9a-f]{64}")
MIN_DISTINTOS = 4


# --- Geradores de operações ----------------------------------------------------

_idx = st.integers(min_value=0, max_value=50)

_op_cadastro = st.tuples(st.just("cadastro"), _idx, nomes_validos(), senhas_validas())
# (usuario, usa a senha certa?, senha errada)
_op_login = st.tuples(st.just("login"), _idx, st.booleans(), senhas_validas())
# (usuario, sessao, senha atual certa?, senha errada, nova senha)
_op_troca = st.tuples(
    st.just("troca"), _idx, _idx, st.booleans(), senhas_validas(), senhas_validas()
)
_op_pedido = st.tuples(st.just("pedido"), _idx)
# (usuario, qual token, nova senha, token aleatório)
_op_confirmacao = st.tuples(
    st.just("confirmacao"),
    _idx,
    st.sampled_from(["ultimo", "ultimo", "anterior", "aleatorio"]),
    senhas_validas(),
    tokens_aleatorios(),
)
_op_perfil = st.tuples(st.just("perfil"), _idx, _idx, descricoes_validas())
_op_logout = st.tuples(st.just("logout"), _idx, _idx)
_op_me = st.tuples(st.just("me"), _idx, _idx)

_operacoes = st.lists(
    st.one_of(
        _op_cadastro,
        _op_login,
        _op_troca,
        _op_pedido,
        _op_confirmacao,
        _op_perfil,
        _op_logout,
        _op_me,
    ),
    max_size=14,
)


# --- Modelo -------------------------------------------------------------------


@dataclass
class _Conta:
    email: str
    senha: str
    id: str
    nome: str
    username: str
    tokens_sessao: list[str] = field(default_factory=list)
    ativos: set[str] = field(default_factory=set)
    resets: list[str] = field(default_factory=list)
    reset_valido: str | None = None


@dataclass
class _Registro:
    """Uma resposta HTTP: os textos dela e o Token_Sessao que ela criou (se criou)."""

    textos: list[str]
    token_proprio: str | None


class _Capturador:
    """Invólucro de ``gerar_token`` que guarda cada token gerado, em ordem."""

    def __init__(self, original: Callable[[], str]) -> None:
        self._original = original
        self.gerados: list[str] = []

    def __call__(self) -> str:
        token = self._original()
        self.gerados.append(token)
        return token


def _strings_json(valor) -> Iterable[str]:
    if isinstance(valor, str):
        yield valor
    elif isinstance(valor, dict):
        for chave, item in valor.items():
            yield str(chave)
            yield from _strings_json(item)
    elif isinstance(valor, list):
        for item in valor:
            yield from _strings_json(item)


def _textos_da_resposta(resposta) -> list[str]:
    textos = [resposta.text]
    textos.extend(f"{nome}: {valor}" for nome, valor in resposta.headers.items())
    if resposta.content:
        try:
            textos.extend(_strings_json(resposta.json()))
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return textos


def _distintiva(senha: str) -> bool:
    return len(senha) >= 8 and len(set(senha)) >= MIN_DISTINTOS


def _em_publico(senha: str, publicos: set[str]) -> bool:
    return any(senha in p or senha in p.lower() for p in publicos)


def _imprimiveis_distintos(senha: str) -> int:
    return len({c for c in senha if c.isprintable() and not c.isspace()})


def _hashes_guardados(db) -> set[str]:
    hashes = set(db.execute(text("SELECT hash_senha FROM usuario")).scalars())
    hashes |= set(db.execute(text("SELECT token_hash FROM sessao")).scalars())
    hashes |= set(db.execute(text("SELECT token_hash FROM token_redefinicao")).scalars())
    return hashes


def _despejar_celulas(db) -> list[tuple[str, object]]:
    """Todas as células de todas as tabelas, como ``(tabela, valor)``."""
    tabelas = db.execute(
        text("SELECT name FROM sqlite_master WHERE type = 'table'")
    ).scalars().all()
    assert {"usuario", "sessao", "token_redefinicao"} <= set(tabelas)
    celulas: list[tuple[str, object]] = []
    for tabela in tabelas:
        nome = tabela.replace('"', '""')
        for linha in db.execute(text(f'SELECT * FROM "{nome}"')):
            celulas.extend((tabela, valor) for valor in linha)
    return celulas


def _contem(celula: object, segredo: str) -> bool:
    if celula is None:
        return False
    if isinstance(celula, (bytes, bytearray, memoryview)):
        return segredo.encode("utf-8") in bytes(celula)
    return segredo in str(celula)


def _bytes_do_banco(caminho: Path) -> bytes:
    partes = []
    for candidato in (
        caminho,
        caminho.with_name(caminho.name + "-journal"),
        caminho.with_name(caminho.name + "-wal"),
    ):
        if candidato.exists():
            partes.append(candidato.read_bytes())
    return b"\x00".join(partes)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Teste ----------------------------------------------------------------------


@settings(max_examples=100, deadline=None)
@given(
    emails=st.lists(emails_normalizados(), min_size=1, max_size=3, unique=True),
    primeiro=_op_cadastro,
    operacoes=_operacoes,
)
def test_nenhum_segredo_e_persistido_em_texto_claro(
    criar_app_isolada, banco_modelo, emails, primeiro, operacoes
):
    linha_de_base = Path(banco_modelo).read_bytes()

    contas: dict[str, _Conta] = {}
    senhas_usadas: set[str] = set()
    tokens_sessao: set[str] = set()
    publicos: set[str] = set(emails)
    registros: list[_Registro] = []
    hashes_vistos: set[str] = set()

    with criar_app_isolada() as ctx, pytest.MonkeyPatch.context() as mp:
        capturador = _Capturador(seguranca.gerar_token)
        mp.setattr(seguranca, "gerar_token", capturador)
        cliente = ctx.cliente

        def registrar(resposta, token_proprio: str | None = None) -> None:
            registros.append(_Registro(_textos_da_resposta(resposta), token_proprio))

        def lista_contas() -> list[_Conta]:
            return list(contas.values())

        def escolher_sessao(conta: _Conta, j: int) -> str | None:
            if not conta.tokens_sessao:
                return None
            return conta.tokens_sessao[j % len(conta.tokens_sessao)]

        def nova_sessao(conta: _Conta, resposta) -> None:
            token = resposta.json()["token"]
            assert token not in tokens_sessao
            tokens_sessao.add(token)
            conta.tokens_sessao.append(token)
            conta.ativos.add(token)
            registrar(resposta, token)

        for op in [primeiro, *operacoes]:
            tipo = op[0]
            existentes = lista_contas()

            if tipo == "cadastro":
                _, k, nome, senha = op
                email = emails[k % len(emails)]
                senhas_usadas.add(senha)
                publicos.add(nome)
                resposta = cliente.post(
                    URL_CADASTRO, json={"email": email, "name": nome, "password": senha}
                )
                if email in contas:
                    assert resposta.status_code == 409, resposta.text
                    registrar(resposta)
                else:
                    assert resposta.status_code == 201, resposta.text
                    usuario = resposta.json()["user"]
                    conta = _Conta(
                        email=email,
                        senha=senha,
                        id=usuario["id"],
                        nome=usuario["name"],
                        username=usuario["username"],
                    )
                    publicos.update({usuario["id"], usuario["name"], usuario["username"]})
                    contas[email] = conta
                    nova_sessao(conta, resposta)

            elif not existentes:
                continue

            elif tipo == "login":
                _, i, certa, errada = op
                conta = existentes[i % len(existentes)]
                senha = conta.senha if certa else errada
                senhas_usadas.add(senha)
                resposta = cliente.post(
                    URL_LOGIN, json={"email": conta.email, "password": senha}
                )
                if senha == conta.senha:
                    assert resposta.status_code == 200, resposta.text
                    nova_sessao(conta, resposta)
                else:
                    assert resposta.status_code == 401, resposta.text
                    registrar(resposta)

            elif tipo == "troca":
                _, i, j, certa, errada, nova = op
                conta = existentes[i % len(existentes)]
                token = escolher_sessao(conta, j)
                if token is None:
                    continue
                atual = conta.senha if certa else errada
                senhas_usadas.update({atual, nova})
                resposta = cliente.put(
                    URL_SENHA,
                    json={"currentPassword": atual, "newPassword": nova},
                    headers=_auth(token),
                )
                registrar(resposta)
                if token not in conta.ativos:
                    assert resposta.status_code == 401, resposta.text
                elif atual != conta.senha:
                    assert resposta.status_code == 400, resposta.text
                else:
                    assert resposta.status_code == 204, resposta.text
                    conta.senha = nova
                    conta.ativos = {token}

            elif tipo == "pedido":
                _, i = op
                conta = existentes[i % len(existentes)]
                antes = len(capturador.gerados)
                resposta = cliente.post(URL_PEDIDO, json={"email": conta.email})
                assert resposta.status_code == 202, resposta.text
                registrar(resposta)
                novos = capturador.gerados[antes:]
                assert novos, "o pedido para um e-mail cadastrado não gerou token"
                conta.resets.append(novos[-1])
                conta.reset_valido = novos[-1]

            elif tipo == "confirmacao":
                _, i, qual, nova, aleatorio = op
                conta = existentes[i % len(existentes)]
                if qual == "ultimo" and conta.resets:
                    token = conta.resets[-1]
                elif qual == "anterior" and len(conta.resets) > 1:
                    token = conta.resets[0]
                else:
                    token = aleatorio
                senhas_usadas.add(nova)
                resposta = cliente.post(
                    URL_CONFIRMACAO, json={"token": token, "newPassword": nova}
                )
                registrar(resposta)
                if token == conta.reset_valido:
                    assert resposta.status_code == 204, resposta.text
                    conta.senha = nova
                    conta.ativos = set()
                    conta.reset_valido = None
                else:
                    assert resposta.status_code == 400, resposta.text

            elif tipo == "perfil":
                _, i, j, descricao = op
                conta = existentes[i % len(existentes)]
                token = escolher_sessao(conta, j)
                if token is None:
                    continue
                publicos.add(descricao)
                resposta = cliente.patch(
                    URL_ME,
                    json={
                        "name": conta.nome,
                        "username": conta.username,
                        "description": descricao,
                        "photo": "",
                    },
                    headers=_auth(token),
                )
                registrar(resposta)
                esperado = 200 if token in conta.ativos else 401
                assert resposta.status_code == esperado, resposta.text

            elif tipo == "logout":
                _, i, j = op
                conta = existentes[i % len(existentes)]
                token = escolher_sessao(conta, j)
                if token is None:
                    continue
                resposta = cliente.post(URL_LOGOUT, headers=_auth(token))
                registrar(resposta)
                if token in conta.ativos:
                    assert resposta.status_code == 204, resposta.text
                    conta.ativos.discard(token)
                else:
                    assert resposta.status_code == 401, resposta.text

            elif tipo == "me":
                _, i, j = op
                conta = existentes[i % len(existentes)]
                token = escolher_sessao(conta, j)
                if token is None:
                    continue
                resposta = cliente.get(URL_ME, headers=_auth(token))
                registrar(resposta)
                esperado = 200 if token in conta.ativos else 401
                assert resposta.status_code == esperado, resposta.text

            # Todo hash que já esteve no banco, para conferir as respostas.
            with ctx.sessao() as db:
                hashes_vistos |= _hashes_guardados(db)

        tokens_redefinicao = set(capturador.gerados) - tokens_sessao
        assert tokens_sessao <= set(capturador.gerados)
        tokens = tokens_sessao | tokens_redefinicao

        # Senhas que entram no oráculo (ver docstring).
        senhas_celulas = {
            s for s in senhas_usadas if _distintiva(s) and not _em_publico(s, publicos)
        }
        senhas_arquivo = {
            s
            for s in senhas_celulas
            if _imprimiveis_distintos(s) >= MIN_DISTINTOS
            and s.encode("utf-8") not in linha_de_base
        }
        event(f"senhas verificadas nas células: {len(senhas_celulas)}/{len(senhas_usadas)}")
        event(f"senhas verificadas no arquivo: {len(senhas_arquivo)}/{len(senhas_usadas)}")

        # 1. Células de todas as tabelas (SQL cru).
        with ctx.sessao() as db:
            celulas = _despejar_celulas(db)
            for segredo in [*senhas_celulas, *tokens]:
                for tabela, celula in celulas:
                    assert not _contem(celula, segredo), (
                        f"segredo em texto claro na tabela {tabela}: {segredo!r}"
                    )

            # Só hashes: Argon2id para senhas e SHA-256 hexadecimal para tokens.
            for (hash_senha,) in db.execute(text("SELECT hash_senha FROM usuario")):
                assert hash_senha.startswith("$argon2id$"), hash_senha
            for tabela in ("sessao", "token_redefinicao"):
                for (token_hash,) in db.execute(text(f"SELECT token_hash FROM {tabela}")):
                    assert HEX_64.fullmatch(token_hash), (tabela, token_hash)

            # Exatamente uma linha por token, na tabela do tipo dele.
            def contar(tabela: str, token: str) -> int:
                return db.execute(
                    text(f"SELECT COUNT(*) FROM {tabela} WHERE token_hash = :h"),
                    {"h": seguranca.hash_token(token)},
                ).scalar_one()

            for token in tokens_sessao:
                assert contar("sessao", token) == 1, token
                assert contar("token_redefinicao", token) == 0, token
            for token in tokens_redefinicao:
                assert contar("token_redefinicao", token) == 1, token
                assert contar("sessao", token) == 0, token

            n_usuarios = db.execute(text("SELECT COUNT(*) FROM usuario")).scalar_one()
            assert n_usuarios == len(contas)
            hashes_vistos |= _hashes_guardados(db)

        # 2. Bytes crus do arquivo, com todas as conexões fechadas.
        ctx.engine.dispose()
        bruto = _bytes_do_banco(ctx.caminho_db)
        assert bruto.startswith(b"SQLite format 3\x00")
        for segredo in [*senhas_arquivo, *tokens]:
            assert segredo.encode("utf-8") not in bruto, (
                f"segredo em texto claro no arquivo do banco: {segredo!r}"
            )

    # 3. Respostas HTTP.
    senhas_respostas = senhas_celulas
    for registro in registros:
        for texto in registro.textos:
            assert "$argon2" not in texto, texto
            for h in hashes_vistos:
                assert h not in texto, ("hash em resposta", h, texto)
            for segredo in [*senhas_respostas, *tokens_redefinicao]:
                assert segredo not in texto, ("segredo em resposta", segredo, texto)
            for token in tokens_sessao:
                if token != registro.token_proprio:
                    assert token not in texto, ("Token_Sessao fora da sua resposta", texto)
