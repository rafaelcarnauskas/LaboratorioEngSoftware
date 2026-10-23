"""Apoio de sessão para os Testes_Selenium (Requisitos 15.2 e 15.6).

O frontend descarta sessões sem token e, no carregamento, confirma o token em
`GET /usuarios/me`. Por isso os testes que começam logados não podem mais gravar
uma sessão simulada no localStorage: este módulo faz o login real no Backend
(`POST /auth/login`) e grava a resposta `{token, expiresAt, user}` em
`choosen.session`, no mesmo formato usado por `session.js`.

Só usa a biblioteca padrão, sem dependência nova. Exige o Backend em execução
e o Usuario_Demonstracao semeado (`python -m app.autenticacao.semear` em
`backend/`, com `CHOOSEN_ENV=development`).
"""

import json
import os
import urllib.error
import urllib.request
from uuid import uuid4

URL_API = os.environ.get("URL_API", "http://localhost:8000/api/v1")

CHAVE_SESSAO = "choosen.session"
EMAIL_DEMONSTRACAO = "victor@email.com"
SENHA_DEMONSTRACAO = "choosen123"
TIMEOUT_SEGUNDOS = 10


class BackendIndisponivel(RuntimeError):
    """O Backend não respondeu em `URL_API`."""


class FalhaLoginApi(RuntimeError):
    """O Backend respondeu, mas o login não devolveu uma sessão."""


def _post_json(caminho, corpo):
    """Envia `corpo` como JSON para `URL_API + caminho`; devolve `(status, dados)`.

    Respostas 4xx/5xx também são devolvidas (sem exceção) para quem chama
    decidir a mensagem. Falha de rede vira `BackendIndisponivel`.
    """
    url = URL_API.rstrip("/") + caminho
    pedido = urllib.request.Request(
        url,
        data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(pedido, timeout=TIMEOUT_SEGUNDOS) as resposta:
            return resposta.status, _ler_json(resposta.read())
    except urllib.error.HTTPError as erro:
        return erro.code, _ler_json(erro.read())
    except (urllib.error.URLError, TimeoutError, ConnectionError) as erro:
        raise BackendIndisponivel(
            f"Backend inacessível em {URL_API} ({erro}). Suba o Backend antes dos "
            "Testes_Selenium: em backend/, `uvicorn app.main:app --port 8000` com "
            "CHOOSEN_ENV=development, e semeie o usuário de demonstração com "
            "`python -m app.autenticacao.semear`. Use a variável URL_API para "
            "outro endereço."
        ) from erro


def _ler_json(bruto):
    try:
        return json.loads(bruto.decode("utf-8")) if bruto else None
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def montar_sessao(resposta):
    """Reduz a resposta do login/cadastro ao formato de `choosen.session`.

    Grava só `token`, `expiresAt` e `user`, como `saveSession` no frontend.
    """
    if not isinstance(resposta, dict):
        raise FalhaLoginApi(f"Resposta de login inesperada: {resposta!r}")
    faltando = [campo for campo in ("token", "expiresAt", "user") if not resposta.get(campo)]
    if faltando:
        raise FalhaLoginApi(f"Resposta de login sem {', '.join(faltando)}.")
    return {
        "token": resposta["token"],
        "expiresAt": resposta["expiresAt"],
        "user": resposta["user"],
    }


def obter_sessao_via_api(email=EMAIL_DEMONSTRACAO, senha=SENHA_DEMONSTRACAO):
    """Faz `POST /auth/login` e devolve `{token, expiresAt, user}`."""
    status, dados = _post_json("/auth/login", {"email": email, "password": senha})
    if status != 200:
        dica = ""
        if status == 401 and email == EMAIL_DEMONSTRACAO:
            dica = (
                " O usuário de demonstração foi semeado? Em backend/: "
                "`python -m app.autenticacao.semear` com CHOOSEN_ENV=development."
            )
        raise FalhaLoginApi(f"POST {URL_API}/auth/login devolveu {status} para {email}.{dica}")
    return montar_sessao(dados)


def gravar_sessao(driver, sessao):
    """Grava `sessao` em `choosen.session` na origem aberta no navegador."""
    driver.execute_script(
        "window.localStorage.setItem(arguments[0], arguments[1]);",
        CHAVE_SESSAO,
        json.dumps(sessao),
    )


def limpar_sessao(driver):
    """Remove `choosen.session` da origem aberta no navegador."""
    driver.execute_script("window.localStorage.removeItem(arguments[0]);", CHAVE_SESSAO)


def entrar_via_api(driver, url_app, email=EMAIL_DEMONSTRACAO, senha=SENHA_DEMONSTRACAO):
    """Faz POST /auth/login, grava {token, expiresAt, user} em choosen.session e recarrega a página.

    O login é feito antes de abrir o navegador na aplicação, para que um Backend
    parado falhe logo com `BackendIndisponivel`. Abre `url_app` para ter acesso
    ao localStorage dessa origem, grava a sessão e abre `url_app` de novo; o
    frontend então confirma o token em `GET /usuarios/me` e mostra a Home.
    Devolve a sessão gravada.
    """
    sessao = obter_sessao_via_api(email, senha)
    driver.get(url_app)
    gravar_sessao(driver, sessao)
    driver.get(url_app)
    return sessao


def email_unico(prefixo="ana", dominio="email.com"):
    """E-mail novo a cada chamada (ex.: `ana.1a2b3c4d@email.com`), para cadastros repetíveis."""
    return f"{prefixo}.{uuid4().hex[:8]}@{dominio}"
