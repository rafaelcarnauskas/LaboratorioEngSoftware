"""API_Autenticacao (camada de Comunicação da Parte 1).

Este módulo guarda o contrato HTTP/JSON da Parte 1: os schemas Pydantic de
request/response, as dependências `obter_sessao_atual` / `obter_usuario_atual`
e o `router` incluído por `main.py` sob `/api/v1`.

Os schemas só garantem tipo e presença dos campos. Tamanhos, caracteres
permitidos e formato da foto são validados pelas funções puras de
`servico.py`, para que o erro 422 liste todos os campos inválidos com as
mesmas mensagens em cadastro, edição e semeadura.

O JSON usa camelCase em inglês (`isCommunityAdmin`, `expiresAt`), gerado a
partir dos nomes em snake_case por `alias_generator=to_camel`
(Requisito 12.4). `populate_by_name=True` permite criar os schemas no código
pelos nomes em Python.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.autenticacao.modelo import Sessao, Usuario
from app.autenticacao.servico import (
    ErroDominio,
    _carregar_por_id,
    alterar_senha,
    atualizar,
    autenticar,
    buscar_por_id,
    buscar_usuario,
    cadastrar,
    confirmar_redefinicao,
    exigir_campos_validos,
    para_perfil_publico,
    pedir_redefinicao,
    revogar_sessao,
    validar_email,
    validar_sessao,
)
from app.core.relogio import obter_relogio
from app.db.sessao import obter_db


def _serializar_utc(valor: datetime) -> str:
    """Serializa um instante como ISO-8601 em UTC com sufixo `Z`.

    Exemplo: `2025-01-08T12:00:00Z`. Um `datetime` sem fuso é tratado como
    UTC, porque todo instante do Backend é gravado em UTC (DataHoraUTC).
    """
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    else:
        valor = valor.astimezone(timezone.utc)
    return valor.isoformat().replace("+00:00", "Z")


# Instante em UTC, serializado como `...Z` no JSON de resposta.
InstanteUTC = Annotated[datetime, PlainSerializer(_serializar_utc, return_type=str)]


class _SchemaBase(BaseModel):
    """Configuração comum: aliases camelCase e aceitação dos nomes em Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


# ---------------------------------------------------------------------------
# Respostas
# ---------------------------------------------------------------------------


class PerfilPublico(_SchemaBase):
    """Único formato de saída de Usuario (Requisito 1.13).

    Não tem campo para Hash_Senha nem Token_Sessao. É imutável para que as
    partes 2–5, que o recebem via `obter_usuario_atual`, não o alterem.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    username: str
    email: str
    description: str
    photo: str
    is_community_admin: bool
    is_system_admin: bool
    created_at: InstanteUTC
    updated_at: InstanteUTC


class RespostaSessao(_SchemaBase):
    """Resposta de login e cadastro: `{token, expiresAt, user}`.

    É a única vez em que o Token_Sessao aparece em texto claro (Requisito 2.4).
    """

    token: str
    expires_at: InstanteUTC
    user: PerfilPublico


# ---------------------------------------------------------------------------
# Requisições
# ---------------------------------------------------------------------------


class PedidoLogin(_SchemaBase):
    """Corpo de `POST /auth/login`."""

    email: str
    password: str


class PedidoCadastro(_SchemaBase):
    """Corpo de `POST /auth/cadastro`.

    Campos extras (ex.: `isSystemAdmin`) são ignorados; o serviço sempre cria
    o Usuario sem privilégios (Requisito 1.10).
    """

    email: str
    name: str
    password: str


class PedidoRedefinicao(_SchemaBase):
    """Corpo de `POST /auth/redefinicao-senha`."""

    email: str


class ConfirmacaoRedefinicao(_SchemaBase):
    """Corpo de `POST /auth/redefinicao-senha/confirmacao`.

    `new_password` não tem limite de tamanho aqui: o serviço valida o token
    primeiro e só depois o tamanho da senha, respondendo 400 (e não 422)
    (Requisitos 5.7 e 5.10).
    """

    token: str
    new_password: str


class DadosPerfil(_SchemaBase):
    """Corpo de `PATCH /usuarios/me`.

    Os quatro campos são obrigatórios (Requisito 7.1): as chaves precisam
    estar presentes, e `description`/`photo` aceitam `null`, que o serviço
    grava como texto vazio. `extra="ignore"` descarta campos como `email` ou
    `isSystemAdmin` (Requisito 7.3).
    """

    model_config = ConfigDict(extra="ignore")

    name: str
    username: str
    description: str | None
    photo: str | None


class PedidoTrocaSenha(_SchemaBase):
    """Corpo de `PUT /usuarios/me/senha`."""

    current_password: str
    new_password: str


# ---------------------------------------------------------------------------
# Dependências de sessão (Requisitos 10.2, 10.3 e 11.4)
# ---------------------------------------------------------------------------

# `auto_error=False`: cabeçalho ausente ou fora de `Bearer <token>` chega como
# `None`, e a resposta 401 é montada por `obter_sessao_atual` no envelope padrão,
# não pelo `{"detail": ...}` do FastAPI.
esquema_bearer = HTTPBearer(auto_error=False)

CODIGO_SESSAO_INVALIDA = "sessao_invalida"
MSG_SESSAO_INVALIDA = "Sessão inválida ou expirada. Entre novamente."


def erro_sessao_invalida() -> ErroDominio:
    """`401 sessao_invalida` com `WWW-Authenticate: Bearer` (10.2).

    O cabeçalho viaja em `ErroDominio.headers` e o handler de `main.py` o copia
    para a resposta. Todas as causas (cabeçalho ausente, formato errado, token
    desconhecido, revogado ou expirado) produzem exatamente esta resposta.
    """
    return ErroDominio(
        401,
        CODIGO_SESSAO_INVALIDA,
        MSG_SESSAO_INVALIDA,
        headers={"WWW-Authenticate": "Bearer"},
    )


def obter_sessao_atual(
    credenciais: Annotated[HTTPAuthorizationCredentials | None, Depends(esquema_bearer)],
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> Sessao:
    """Valida `Authorization: Bearer <token>` e devolve a Sessao_Valida.

    Sem cabeçalho, com outro esquema (ex.: `Basic`), com token vazio, ou com
    token desconhecido, revogado ou expirado (`expira_em <= agora`), lança
    `401 sessao_invalida` com `WWW-Authenticate: Bearer`. Como é dependência,
    o 401 sai antes de o código do endpoint executar e nada é gravado.

    Usada pelos endpoints da Parte 1 que precisam da entidade interna
    (logout, edição de perfil, troca de senha).
    """
    if credenciais is None or credenciais.scheme.lower() != "bearer":
        raise erro_sessao_invalida()
    token = credenciais.credentials.strip()
    if not token:
        raise erro_sessao_invalida()
    sessao = validar_sessao(db, token, agora)
    if sessao is None:
        raise erro_sessao_invalida()
    return sessao


def obter_usuario_atual(
    sessao: Annotated[Sessao, Depends(obter_sessao_atual)],
    db: Annotated[Session, Depends(obter_db)],
) -> PerfilPublico:
    """Perfil_Publico do dono da Sessao_Valida da requisição (10.3, 11.4).

    Devolve o `PerfilPublico` obtido por `buscar_por_id`: sem Token_Sessao e
    sem Hash_Senha. Sem Sessao_Valida (ou se o Usuario não existir mais),
    responde `401 sessao_invalida` com `WWW-Authenticate: Bearer` antes de o
    endpoint executar.

    Regra para as partes 2 a 5 (Requisitos 10.1 e 11.5):

    - todo router dessas partes é incluído em `main.py` com
      `dependencies=[Depends(obter_usuario_atual)]`, o que torna todos os
      seus endpoints Endpoint_Protegido, sem exceção;
    - o endpoint que precisa do Usuario declara
      `usuario: PerfilPublico = Depends(obter_usuario_atual)` (o FastAPI
      reaproveita o mesmo resultado na requisição);
    - de `app.autenticacao`, essas partes só importam `obter_usuario_atual`
      (deste módulo) e `buscar_por_id` (de `app.autenticacao.servico`);
      nunca `modelo.py`, as tabelas `usuario`/`sessao` ou outras funções.
    """
    perfil = buscar_por_id(db, sessao.usuario_id)
    if perfil is None:
        raise erro_sessao_invalida()
    return perfil


# ---------------------------------------------------------------------------
# Router (prefixo `/api/v1` aplicado em `main.py`)
# ---------------------------------------------------------------------------

router = APIRouter()

MSG_SENHA_OBRIGATORIA = "Informe a senha."


class RespostaEmailEmUso(_SchemaBase):
    """Resposta de `GET /auth/email-em-uso`: `{inUse}`."""

    in_use: bool


def _ttl_sessao(request: Request) -> int:
    """TTL da Sessao em minutos, da configuração carregada por `create_app()`."""
    return request.app.state.config.session_ttl_minutes


def _resposta_sessao(sessao: Sessao, token: str, usuario: Usuario) -> RespostaSessao:
    return RespostaSessao(
        token=token,
        expires_at=sessao.expira_em,
        user=para_perfil_publico(usuario),
    )


@router.post("/auth/login", response_model=RespostaSessao, tags=["autenticacao"])
def login(
    pedido: PedidoLogin,
    request: Request,
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> RespostaSessao:
    """Login (3.2–3.4, 3.8).

    E-mail que não é Email_Valido ou senha vazia → `422 validacao` antes de
    qualquer consulta ao Servico_Usuario. Credenciais erradas (e-mail
    inexistente ou senha que não confere) → `401 credenciais_invalidas`, com
    o mesmo corpo nos dois casos. Sucesso → `200 {token, expiresAt, user}`.
    """
    exigir_campos_validos(
        (
            ("email", validar_email(pedido.email)),
            ("password", MSG_SENHA_OBRIGATORIA if pedido.password == "" else None),
        )
    )
    sessao, token, usuario = autenticar(
        db, pedido.email, pedido.password, agora, _ttl_sessao(request)
    )
    return _resposta_sessao(sessao, token, usuario)


@router.post(
    "/auth/cadastro",
    response_model=RespostaSessao,
    status_code=201,
    tags=["autenticacao"],
)
def cadastro(
    pedido: PedidoCadastro,
    request: Request,
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> RespostaSessao:
    """Cadastro com login automático (4.2, 4.5, 4.7–4.9).

    Só `name`, `email` e `password` são repassados ao serviço; campos extras
    (ex.: `isSystemAdmin`) são descartados pelo schema (1.10). Sucesso →
    `201 {token, expiresAt, user}`; `422 validacao` lista cada campo inválido;
    `409 email_em_uso`; `500 falha_ao_salvar`. Em qualquer falha, nem Usuario
    nem Sessao ficam gravados.
    """
    sessao, token, usuario = cadastrar(
        db, pedido.name, pedido.email, pedido.password, agora, _ttl_sessao(request)
    )
    return _resposta_sessao(sessao, token, usuario)


@router.get(
    "/auth/email-em-uso", response_model=RespostaEmailEmUso, tags=["autenticacao"]
)
def email_em_uso(
    db: Annotated[Session, Depends(obter_db)],
    email: str = "",
) -> RespostaEmailEmUso:
    """`{inUse}` igual a `buscar_usuario(email) is not None` (4.12, 11.3).

    E-mail ausente ou que não é Email_Valido devolve `inUse: false` sem
    consultar o banco. Só leitura.
    """
    if validar_email(email) is not None:
        return RespostaEmailEmUso(in_use=False)
    return RespostaEmailEmUso(in_use=buscar_usuario(db, email) is not None)


MSG_PEDIDO_REDEFINICAO = (
    "Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição."
)


class RespostaMensagem(_SchemaBase):
    """Resposta com só uma mensagem: `{message}`."""

    message: str


@router.post(
    "/auth/redefinicao-senha",
    response_model=RespostaMensagem,
    status_code=202,
    tags=["autenticacao"],
)
def pedido_redefinicao_senha(
    pedido: PedidoRedefinicao,
    request: Request,
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> RespostaMensagem:
    """Pedido de redefinição de senha (5.2, 5.5).

    E-mail que não é Email_Valido → `422 validacao`. Qualquer Email_Valido,
    cadastrado ou não → `202` com a mesma mensagem fixa, byte a byte, sem o
    token nem dados do Usuario. `pedir_redefinicao` não lança erro por falha
    de persistência, então a resposta não revela se o e-mail existe.
    """
    exigir_campos_validos((("email", validar_email(pedido.email)),))
    pedir_redefinicao(db, pedido.email, agora, request.app.state.config)
    return RespostaMensagem(message=MSG_PEDIDO_REDEFINICAO)


@router.post(
    "/auth/redefinicao-senha/confirmacao",
    status_code=204,
    response_class=Response,
    tags=["autenticacao"],
)
def confirmacao_redefinicao_senha(
    confirmacao: ConfirmacaoRedefinicao,
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> Response:
    """Confirmação da redefinição (5.6, 5.7, 5.10). Pública: sem sessão.

    Sucesso → `204` sem corpo (senha trocada, token usado e todas as Sessoes
    do Usuario revogadas). Token vazio, desconhecido, usado, invalidado ou
    expirado → `400 token_invalido`, com precedência sobre a senha; senha
    fora de 8–128 com token válido → `400 senha_invalida` (o token continua
    utilizável); falha de persistência → `500 falha_ao_salvar`.
    """
    confirmar_redefinicao(db, confirmacao.token, confirmacao.new_password, agora)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Endpoints protegidos da Parte 1 (logout, perfil e troca de senha)
# ---------------------------------------------------------------------------


def _usuario_da_sessao(db: Session, sessao: Sessao) -> Usuario:
    """Entidade Usuario dono de ``sessao``, carregada na mesma ``db`` da requisição.

    Se o Usuario não existir mais, responde ``401 sessao_invalida`` como
    qualquer outra sessão inválida.
    """
    usuario = _carregar_por_id(db, sessao.usuario_id)
    if usuario is None:
        raise erro_sessao_invalida()
    return usuario


@router.post(
    "/auth/logout",
    status_code=204,
    response_class=Response,
    tags=["autenticacao"],
)
def logout(
    sessao: Annotated[Sessao, Depends(obter_sessao_atual)],
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> Response:
    """Logout (9.3, 9.4, 10.2).

    Revoga só a Sessao do token enviado e responde `204` sem corpo. Token
    ausente, desconhecido, expirado ou já revogado → `401 sessao_invalida`
    pela dependência, antes de qualquer escrita; nenhuma Sessao é alterada.
    """
    revogar_sessao(db, sessao, agora)
    return Response(status_code=204)


@router.get("/usuarios/me", response_model=PerfilPublico, tags=["usuarios"])
def obter_perfil(
    usuario: Annotated[PerfilPublico, Depends(obter_usuario_atual)],
) -> PerfilPublico:
    """Perfil_Publico do Usuario logado (6.2). Só leitura.

    `obter_usuario_atual` depende de `obter_sessao_atual`: sem Sessao_Valida
    responde `401 sessao_invalida`.
    """
    return usuario


@router.patch("/usuarios/me", response_model=PerfilPublico, tags=["usuarios"])
def editar_perfil(
    dados: DadosPerfil,
    sessao: Annotated[Sessao, Depends(obter_sessao_atual)],
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> PerfilPublico:
    """Edição de perfil (7.2–7.5, 7.8, 7.9).

    Só `name`, `username`, `description` e `photo` chegam ao serviço; outros
    campos (ex.: `email`, `isSystemAdmin`) são descartados pelo schema (7.3).
    Sucesso → `200 PerfilPublico` com os valores gravados. `422 validacao`
    lista cada campo inválido; `409 username_em_uso`; `500 falha_ao_salvar`
    (o Usuario fica como estava).
    """
    usuario = _usuario_da_sessao(db, sessao)
    return para_perfil_publico(atualizar(db, usuario, dados, agora))


@router.put(
    "/usuarios/me/senha",
    status_code=204,
    response_class=Response,
    tags=["usuarios"],
)
def trocar_senha(
    pedido: PedidoTrocaSenha,
    sessao: Annotated[Sessao, Depends(obter_sessao_atual)],
    db: Annotated[Session, Depends(obter_db)],
    agora: Annotated[datetime, Depends(obter_relogio)],
) -> Response:
    """Troca de senha do Usuario logado (8.4–8.8).

    Sucesso → `204` sem corpo: Hash_Senha trocado e todas as outras Sessoes
    do Usuario revogadas; a Sessao desta requisição continua válida.
    `newPassword` fora de 8–128 → `422 validacao` (com precedência sobre a
    senha atual errada); senha atual errada → `400 senha_atual_incorreta`;
    `500 falha_ao_salvar` desfaz tudo.
    """
    usuario = _usuario_da_sessao(db, sessao)
    alterar_senha(
        db, usuario, sessao, pedido.current_password, pedido.new_password, agora
    )
    return Response(status_code=204)
