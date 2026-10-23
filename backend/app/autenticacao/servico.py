"""Model da Parte 1 — Autenticação e conta.

Este arquivo reúne, em seções, as regras de negócio da Parte 1 (Requisito 13.11):

1. Validação: exceção de domínio e funções puras que validam os campos do Usuario.
   São usadas igualmente pelo cadastro, pela edição de perfil, pela troca de senha
   e pela semeadura, para que as mensagens e os limites sejam os mesmos em todos
   os fluxos.
2. Servico_Usuario: criar, buscar e atualizar Usuarios e alterar senhas.
3. Servico_Autenticacao: autenticar credenciais, criar, validar e revogar Sessoes
   e gerenciar Tokens_Redefinicao.
"""

from __future__ import annotations

import base64
import binascii
import logging
import re
import threading
from collections.abc import Callable, Iterable, Mapping
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.autenticacao.modelo import Sessao, TokenRedefinicao, Usuario
from app.core import seguranca
from app.core.seguranca import gerar_hash_senha, verificar_senha

if TYPE_CHECKING:
    from app.autenticacao.api import DadosPerfil, PerfilPublico
    from app.core.config import Configuracao

# =============================================================================
# Validação
# =============================================================================


class ErroDominio(Exception):
    """Erro de regra de negócio, convertido pelo handler de ``main.py`` no envelope
    ``{"error": {"code", "message", "fields"}}``.

    ``fields`` só é preenchido em erros 422 (``validacao``) e lista todos os campos
    inválidos como ``[{"field": "<camelCase>", "message": "<texto>"}]``.

    ``headers`` (opcional, só por nome) são cabeçalhos HTTP que o handler copia
    para a resposta. É assim que o ``401 sessao_invalida`` de
    ``api.obter_sessao_atual`` leva ``WWW-Authenticate: Bearer`` (10.2).
    """

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        fields: list[dict[str, str]] | None = None,
        *,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.headers = dict(headers) if headers else None

    def __repr__(self) -> str:
        return (
            f"ErroDominio(status={self.status!r}, code={self.code!r}, "
            f"message={self.message!r}, fields={self.fields!r})"
        )


# Limites das regras do Requisito 1.
EMAIL_MIN = 3
EMAIL_MAX = 254
NOME_MIN = 1
NOME_MAX = 60
DESCRICAO_MAX = 160
SENHA_MIN = 8
SENHA_MAX = 128
FOTO_MAX_BYTES = 2_097_152  # 2 MB decodificados

# Padrões. Sempre usados com ``fullmatch``: ``$`` casaria antes de um "\n" final.
_PADRAO_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
_PADRAO_USERNAME = re.compile(r"[A-Za-z0-9._]{1,30}")
_PADRAO_PREFIXO_FOTO = re.compile(r"data:image/[A-Za-z0-9.+-]+;base64,")

# Tamanho máximo do trecho base64 cujo conteúdo decodificado cabe em FOTO_MAX_BYTES.
# Permite recusar entradas enormes sem decodificá-las.
_FOTO_MAX_BASE64 = 4 * ((FOTO_MAX_BYTES + 2) // 3)

MENSAGEM_VALIDACAO = "Alguns campos são inválidos."
MSG_EMAIL_INVALIDO = "Informe um e-mail válido."
MSG_NOME_INVALIDO = "O nome deve ter de 1 a 60 caracteres."
MSG_USERNAME_INVALIDO = "Use de 1 a 30 caracteres: letras, números, ponto ou sublinhado."
MSG_DESCRICAO_INVALIDA = "A descrição pode ter no máximo 160 caracteres."
MSG_FOTO_INVALIDA = "A foto deve ser uma imagem (data URL em base64) de até 2 MB."
MSG_SENHA_INVALIDA = "A senha deve ter de 8 a 128 caracteres."


def normalizar_email(email: str) -> str:
    """Email_Normalizado: sem espaços nas extremidades e em minúsculas."""
    return email.strip().lower()


def validar_email(email: str) -> str | None:
    """Email_Valido (Requisito 1.2 + glossário): após normalizar, 3 a 254 caracteres,
    exatamente um ``@`` e o padrão ``^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$``."""
    if not isinstance(email, str):
        return MSG_EMAIL_INVALIDO
    normalizado = normalizar_email(email)
    if not EMAIL_MIN <= len(normalizado) <= EMAIL_MAX:
        return MSG_EMAIL_INVALIDO
    if normalizado.count("@") != 1:
        return MSG_EMAIL_INVALIDO
    if _PADRAO_EMAIL.fullmatch(normalizado) is None:
        return MSG_EMAIL_INVALIDO
    return None


def validar_nome(nome: str) -> str | None:
    """Nome com 1 a 60 caracteres após remover os espaços das extremidades (1.6)."""
    if not isinstance(nome, str):
        return MSG_NOME_INVALIDO
    if not NOME_MIN <= len(nome.strip()) <= NOME_MAX:
        return MSG_NOME_INVALIDO
    return None


def validar_username(username: str) -> str | None:
    """Username com 1 a 30 caracteres entre A–Z, a–z, 0–9, ``.`` e ``_`` (1.7)."""
    if not isinstance(username, str):
        return MSG_USERNAME_INVALIDO
    if _PADRAO_USERNAME.fullmatch(username) is None:
        return MSG_USERNAME_INVALIDO
    return None


def validar_descricao(descricao: str | None) -> str | None:
    """Descrição com 0 a 160 caracteres; ``None`` é tratado como ``""`` (1.8)."""
    if descricao is None:
        descricao = ""
    if not isinstance(descricao, str):
        return MSG_DESCRICAO_INVALIDA
    if len(descricao) > DESCRICAO_MAX:
        return MSG_DESCRICAO_INVALIDA
    return None


def validar_foto(foto: str | None) -> str | None:
    """Foto vazia (``""`` ou ``None``) ou data URL ``data:image/<subtipo>;base64,``
    cujo conteúdo decodificado tenha no máximo 2 097 152 bytes (1.9).

    Base64 malformado (caractere fora do alfabeto ou padding incorreto) é inválido.
    """
    if foto is None or foto == "":
        return None
    if not isinstance(foto, str):
        return MSG_FOTO_INVALIDA
    prefixo = _PADRAO_PREFIXO_FOTO.match(foto)
    if prefixo is None:
        return MSG_FOTO_INVALIDA
    conteudo = foto[prefixo.end():]
    if len(conteudo) > _FOTO_MAX_BASE64:
        return MSG_FOTO_INVALIDA
    try:
        decodificado = base64.b64decode(conteudo, validate=True)
    except (binascii.Error, ValueError):
        return MSG_FOTO_INVALIDA
    if len(decodificado) > FOTO_MAX_BYTES:
        return MSG_FOTO_INVALIDA
    return None


def validar_senha(senha: str) -> str | None:
    """Senha com 8 a 128 caracteres (4.2, 5.6, 8.4, 8.8)."""
    if not isinstance(senha, str):
        return MSG_SENHA_INVALIDA
    if not SENHA_MIN <= len(senha) <= SENHA_MAX:
        return MSG_SENHA_INVALIDA
    return None


def para_camel(nome: str) -> str:
    """Converte ``snake_case`` em ``camelCase`` (``nova_senha`` → ``novaSenha``).
    Nomes já em camelCase ficam como estão."""
    primeira, *resto = nome.split("_")
    return primeira + "".join(parte[:1].upper() + parte[1:] for parte in resto)


def erro_validacao(
    erros: Mapping[str, str | None] | Iterable[tuple[str, str | None]],
) -> ErroDominio | None:
    """Junta os resultados de vários validadores num único ``ErroDominio``
    422 ``validacao``, listando **todos** os campos inválidos (1.14, 4.8, 7.5).

    ``erros`` mapeia o nome do campo do request para a mensagem devolvida pelo
    validador (``None`` quando válido). Os nomes saem em camelCase, na ordem dada.
    Devolve ``None`` quando nenhum campo é inválido.
    """
    pares = erros.items() if isinstance(erros, Mapping) else erros
    fields = [
        {"field": para_camel(campo), "message": mensagem}
        for campo, mensagem in pares
        if mensagem is not None
    ]
    if not fields:
        return None
    return ErroDominio(422, "validacao", MENSAGEM_VALIDACAO, fields)


def exigir_campos_validos(
    erros: Mapping[str, str | None] | Iterable[tuple[str, str | None]],
) -> None:
    """Lança o ``ErroDominio`` de :func:`erro_validacao` se algum campo for inválido."""
    erro = erro_validacao(erros)
    if erro is not None:
        raise erro


# Username derivado no cadastro (Requisitos 4.3 e 4.4).
USERNAME_MAX = 30
USERNAME_BASE_PADRAO = "usuario"
_CARACTERES_FORA_DO_USERNAME = re.compile(r"[^A-Za-z0-9._]")


def derivar_username_base(email_normalizado: str) -> str:
    """Base do username derivado (4.3): a parte local do Email_Normalizado (o trecho
    antes do ``@``) sem os caracteres fora de ``[A-Za-z0-9._]``, truncada para 30
    caracteres; ``"usuario"`` quando o resultado fica vazio."""
    parte_local = email_normalizado.split("@", 1)[0]
    base = _CARACTERES_FORA_DO_USERNAME.sub("", parte_local)[:USERNAME_MAX]
    return base or USERNAME_BASE_PADRAO


def candidato_username(base: str, n: int) -> str:
    """``n``-ésimo candidato a username (4.4): ``n == 1`` devolve a própria base;
    ``n >= 2`` acrescenta o sufixo ``n`` e trunca a base para caber em 30 caracteres."""
    if n == 1:
        return base
    sufixo = str(n)
    return base[: USERNAME_MAX - len(sufixo)] + sufixo


# =============================================================================
# Servico_Usuario
# =============================================================================
# Criar, buscar e atualizar Usuarios e alterar senhas.

# Código 500 escolhido por quem chama ``confirmar`` (1.15 ou 2.9).
CODIGO_FALHA_AO_SALVAR = "falha_ao_salvar"
CODIGO_SESSAO_NAO_CRIADA = "sessao_nao_criada"

MSG_EMAIL_EM_USO = "Já existe uma conta com este e-mail."
MSG_USERNAME_EM_USO = "Este nome de usuário já está em uso."
_MENSAGENS_FALHA = {
    CODIGO_FALHA_AO_SALVAR: "Não foi possível salvar as alterações. Tente novamente.",
    CODIGO_SESSAO_NAO_CRIADA: "Não foi possível iniciar a sessão. Tente novamente.",
}

# Formato canônico de ``str(uuid4())``, o único que o modelo grava em ``id``.
_PADRAO_UUID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)

# Como reconhecer cada constraint única na mensagem do driver: o PostgreSQL cita
# o nome da constraint; o SQLite cita ``tabela.coluna``.
_SINAIS_UQ_EMAIL = ("uq_usuario_email", "usuario.email")
_SINAIS_UQ_USERNAME = ("uq_usuario_username_normalizado", "usuario.username_normalizado")
_SINAIS_UQ_TOKEN_SESSAO = ("uq_sessao_token_hash", "sessao.token_hash")
_SINAIS_UQ_TOKEN_REDEFINICAO = (
    "uq_token_redefinicao_token_hash",
    "token_redefinicao.token_hash",
)


class ErroUsernameEmUso(ErroDominio):
    """``409 username_em_uso`` vindo de ``uq_usuario_username_normalizado``.

    É uma subclasse para que o cadastro a capture e tente o próximo candidato
    (4.4); na edição de perfil ela simplesmente sobe como 409 (7.4).
    """

    def __init__(self) -> None:
        super().__init__(409, "username_em_uso", MSG_USERNAME_EM_USO)


class ErroTokenSessaoEmUso(ErroDominio):
    """``500 codigo_falha`` vindo de ``uq_sessao_token_hash`` (colisão de token).

    Para quem chama é o mesmo 500 de qualquer outra falha; é uma subclasse só
    para que :func:`criar_sessao` a capture e tente de novo com outro token (2.3).
    """

    def __init__(self, codigo_falha: str) -> None:
        super().__init__(500, codigo_falha, _MENSAGENS_FALHA[codigo_falha])


def _constraint_violada(erro: IntegrityError) -> str | None:
    """Identifica qual constraint única (do Usuario ou o ``token_hash`` da Sessao
    ou do TokenRedefinicao) causou o ``IntegrityError``.

    Olha só o erro do driver (``erro.orig``), e não ``str(erro)``, que inclui o SQL
    da instrução e poderia citar ``usuario.email`` num ``WHERE``.
    """
    origem = erro.orig
    nome = getattr(getattr(origem, "diag", None), "constraint_name", None)  # psycopg
    texto = " ".join(str(parte) for parte in (nome, origem) if parte).lower()
    if any(sinal in texto for sinal in _SINAIS_UQ_USERNAME):
        return "uq_usuario_username_normalizado"
    if any(sinal in texto for sinal in _SINAIS_UQ_EMAIL):
        return "uq_usuario_email"
    if any(sinal in texto for sinal in _SINAIS_UQ_TOKEN_SESSAO):
        return "uq_sessao_token_hash"
    if any(sinal in texto for sinal in _SINAIS_UQ_TOKEN_REDEFINICAO):
        return "uq_token_redefinicao_token_hash"
    return None


def confirmar(db: Session, codigo_falha: str = CODIGO_FALHA_AO_SALVAR) -> None:
    """``commit`` único de uma operação de escrita (1.15, 2.9, 4.7, 4.9).

    Em qualquer ``SQLAlchemyError`` faz ``rollback`` (nada parcial fica no banco)
    e lança ``ErroDominio``:

    - ``IntegrityError`` em ``uq_usuario_email`` → ``409 email_em_uso``;
    - ``IntegrityError`` em ``uq_usuario_username_normalizado`` →
      :class:`ErroUsernameEmUso` (409), que o cadastro captura para tentar de novo;
    - ``IntegrityError`` em ``uq_sessao_token_hash`` →
      :class:`ErroTokenSessaoEmUso` (``500 codigo_falha``), que
      :func:`criar_sessao` captura para tentar com outro token;
    - qualquer outro erro → ``500 codigo_falha`` (``falha_ao_salvar`` ou
      ``sessao_nao_criada``).
    """
    if codigo_falha not in _MENSAGENS_FALHA:
        raise ValueError(f"codigo_falha desconhecido: {codigo_falha!r}")
    try:
        db.commit()
    except SQLAlchemyError as erro:
        raise _desfazer_e_traduzir(db, erro, codigo_falha) from erro


def _desfazer_e_traduzir(
    db: Session, erro: SQLAlchemyError, codigo_falha: str
) -> ErroDominio:
    """Faz ``rollback`` e devolve o ``ErroDominio`` equivalente a ``erro``
    (as regras de :func:`confirmar`). Usado também no ``flush`` do cadastro."""
    try:
        db.rollback()
    except SQLAlchemyError:
        pass  # a conexão já está perdida; o erro de domínio é o que importa
    constraint = _constraint_violada(erro) if isinstance(erro, IntegrityError) else None
    if constraint == "uq_usuario_email":
        return ErroDominio(409, "email_em_uso", MSG_EMAIL_EM_USO)
    if constraint == "uq_usuario_username_normalizado":
        return ErroUsernameEmUso()
    if constraint == "uq_sessao_token_hash":
        return ErroTokenSessaoEmUso(codigo_falha)
    return ErroDominio(500, codigo_falha, _MENSAGENS_FALHA[codigo_falha])


def buscar_usuario(db: Session, email: str) -> Usuario | None:
    """``buscarUsuario(email)`` do PDF (11.3): procura pelo Email_Normalizado.

    E-mail vazio, só com espaços, de tipo errado ou inexistente devolve ``None``,
    sem exceção. Só leitura.
    """
    if not isinstance(email, str):
        return None
    normalizado = normalizar_email(email)
    if not normalizado:
        return None
    return db.scalars(select(Usuario).where(Usuario.email == normalizado)).first()


def _carregar_por_id(db: Session, usuario_id: str) -> Usuario | None:
    """Usuario pelo ``id``; ``None`` para id vazio, fora do formato UUID ou
    inexistente. O formato é conferido antes de consultar o banco."""
    if not isinstance(usuario_id, str) or _PADRAO_UUID.fullmatch(usuario_id) is None:
        return None
    return db.get(Usuario, usuario_id.lower())


def buscar_por_id(db: Session, usuario_id: str) -> PerfilPublico | None:
    """Contrato para as partes 2, 4 e 5 (11.1, 11.2): o Perfil_Publico do Usuario
    ou ``None`` (id vazio, malformado ou inexistente), sem exceção. Só leitura:
    não altera nenhum campo, nem ``atualizado_em``."""
    usuario = _carregar_por_id(db, usuario_id)
    if usuario is None:
        return None
    return para_perfil_publico(usuario)


# Tentativas de gravar o Usuario quando outro cadastro simultâneo pega o mesmo
# username entre a consulta e o commit (4.4).
TENTATIVAS_USERNAME = 5
# Candidatos consultados por vez na busca do username livre.
_LOTE_CANDIDATOS = 50


def _primeiro_username_livre(db: Session, base: str, n_inicial: int = 1) -> tuple[str, int]:
    """Primeiro ``candidato_username(base, n)`` com ``n >= n_inicial`` cujo
    ``lower()`` não está em ``username_normalizado`` (4.3, 4.4).

    Consulta os candidatos em lotes (um ``SELECT ... IN`` por lote), então o
    caso comum (base livre ou poucos sufixos ocupados) custa uma consulta.
    Devolve o username e o ``n`` usado.
    """
    n = n_inicial
    while True:
        lote = [
            (candidato_username(base, k), k) for k in range(n, n + _LOTE_CANDIDATOS)
        ]
        normalizados = [username.lower() for username, _ in lote]
        ocupados = set(
            db.scalars(
                select(Usuario.username_normalizado).where(
                    Usuario.username_normalizado.in_(normalizados)
                )
            )
        )
        for username, k in lote:
            if username.lower() not in ocupados:
                return username, k
        n += _LOTE_CANDIDATOS


def criar_usuario(
    db: Session,
    nome: str,
    email: str,
    senha: str,
    agora: datetime,
    *,
    antes_do_commit: Callable[[Usuario], object] | None = None,
    codigo_falha: str = CODIGO_FALHA_AO_SALVAR,
) -> Usuario:
    """Cria o Usuario do cadastro e confirma num único ``commit``
    (1.1–1.6, 1.10, 1.11, 1.14, 1.15, 4.2–4.4, 4.7).

    Ordem:

    1. valida nome, e-mail e senha juntando todos os erros → ``422 validacao``;
    2. checagem prévia do Email_Normalizado → ``409 email_em_uso``;
    3. grava ``nome.strip()``, o Email_Normalizado, ``gerar_hash_senha(senha)``,
       o username derivado (primeiro candidato livre, ver
       :func:`_primeiro_username_livre`), ``username_normalizado``, os dois
       flags de administração ``False`` e ``criado_em == atualizado_em == agora``.

    Transação e nova tentativa (por que não SAVEPOINT): no SQLite com o driver
    ``sqlite3`` em modo legado, um ``SAVEPOINT`` emitido antes de qualquer DML
    vira a transação de fora, e o ``RELEASE`` já grava tudo (conferido com
    SQLAlchemy 2.1 / Python 3.14); um ``begin_nested()`` quebraria a
    atomicidade de ``cadastrar``. Por isso cada tentativa é a unidade de
    trabalho inteira, numa transação só: ``add`` + ``flush`` do Usuario,
    ``antes_do_commit(usuario)`` e um único :func:`confirmar`. Se o ``flush``
    ou o ``commit`` bate em ``uq_usuario_username_normalizado`` (outro cadastro
    simultâneo levou o candidato), a transação inteira já foi desfeita com
    ``rollback`` (os objetos pendentes saem da sessão) e a tentativa seguinte
    procura o próximo sufixo livre, até :data:`TENTATIVAS_USERNAME` vezes;
    esgotadas, ``500 codigo_falha``. ``uq_usuario_email`` vira
    ``409 email_em_uso`` (corrida de cadastros com o mesmo e-mail) e qualquer
    outra falha, ``500 codigo_falha``; em todos os casos nada fica gravado.

    ``antes_do_commit`` é o gancho de ``cadastrar`` (4.9): recebe o Usuario já
    gravado na transação por ``flush`` (``id`` preenchido, ainda sem
    ``commit``) e acrescenta a Sessao, que entra no mesmo ``commit``. É chamado
    de novo a cada tentativa, então deve criar objetos novos sempre; se lançar
    ``ErroDominio``, a transação é desfeita e o erro sobe. ``codigo_falha``
    escolhe o código 500 (``falha_ao_salvar`` ou ``sessao_nao_criada``).

    A ``db`` deve chegar sem alterações pendentes: o ``rollback`` de uma
    tentativa falha descarta tudo o que estiver pendente nela.
    """
    exigir_campos_validos(
        (
            ("name", validar_nome(nome)),
            ("email", validar_email(email)),
            ("password", validar_senha(senha)),
        )
    )
    email_normalizado = normalizar_email(email)
    if buscar_usuario(db, email_normalizado) is not None:
        raise ErroDominio(409, "email_em_uso", MSG_EMAIL_EM_USO)

    nome_limpo = nome.strip()
    hash_senha = gerar_hash_senha(senha)  # uma vez: o Argon2 é caro de propósito
    base = derivar_username_base(email_normalizado)

    n_inicial = 1
    for _ in range(TENTATIVAS_USERNAME):
        username, n = _primeiro_username_livre(db, base, n_inicial)
        usuario = Usuario(
            email=email_normalizado,
            username=username,
            username_normalizado=username.lower(),
            hash_senha=hash_senha,
            nome=nome_limpo,
            descricao="",
            foto="",
            is_community_admin=False,
            is_system_admin=False,
            criado_em=agora,
            atualizado_em=agora,
        )
        try:
            try:
                db.add(usuario)
                db.flush()
            except SQLAlchemyError as erro:
                raise _desfazer_e_traduzir(db, erro, codigo_falha) from erro
            if antes_do_commit is not None:
                try:
                    antes_do_commit(usuario)
                except BaseException:
                    db.rollback()
                    raise
            confirmar(db, codigo_falha)
        except ErroUsernameEmUso:
            n_inicial = n + 1
            continue
        return usuario
    raise ErroDominio(500, codigo_falha, _MENSAGENS_FALHA[codigo_falha])


def atualizar(db: Session, usuario: Usuario, dados: DadosPerfil, agora: datetime) -> Usuario:
    """``atualizar(usuario, dados)`` do PDF: edição de perfil num único ``commit``
    (1.3, 1.4, 1.12, 1.14, 1.15, 7.2–7.5).

    Ordem:

    1. valida nome, username, descrição e foto juntando todos os erros →
       ``422 validacao``;
    2. se ``username.lower()`` pertence a outro Usuario → ``409 username_em_uso``;
       o próprio username com outra caixa é aceito (7.4);
    3. só então atribui ``nome.strip()``, ``username``, ``username_normalizado``,
       ``descricao`` e ``foto`` (``None`` vira ``""``) e ``atualizado_em = agora``,
       e chama :func:`confirmar`. E-mail, Hash_Senha, flags de administração,
       ``id`` e ``criado_em`` nunca são tocados (7.3).

    Nas falhas dos passos 1 e 2 nada foi atribuído ao Usuario. Na falha do
    ``commit``, :func:`confirmar` faz ``rollback``, que expira os atributos: a
    próxima leitura volta aos valores do banco, ou seja, o estado anterior. Uma
    corrida que leve o username entre a consulta e o ``commit`` também vira
    ``409 username_em_uso``; qualquer outra falha, ``500 falha_ao_salvar``.
    """
    nome = dados.name
    username = dados.username
    descricao = "" if dados.description is None else dados.description
    foto = "" if dados.photo is None else dados.photo

    exigir_campos_validos(
        (
            ("name", validar_nome(nome)),
            ("username", validar_username(username)),
            ("description", validar_descricao(descricao)),
            ("photo", validar_foto(foto)),
        )
    )

    username_normalizado = username.lower()
    if username_normalizado != usuario.username_normalizado:
        ocupado = db.scalars(
            select(Usuario.id).where(
                Usuario.username_normalizado == username_normalizado,
                Usuario.id != usuario.id,
            )
        ).first()
        if ocupado is not None:
            raise ErroUsernameEmUso()

    usuario.nome = nome.strip()
    usuario.username = username
    usuario.username_normalizado = username_normalizado
    usuario.descricao = descricao
    usuario.foto = foto
    usuario.atualizado_em = agora
    confirmar(db, CODIGO_FALHA_AO_SALVAR)
    return usuario


MSG_SENHA_ATUAL_INCORRETA = "A senha atual está incorreta."


def alterar_senha(
    db: Session,
    usuario: Usuario,
    sessao_atual: Sessao,
    senha_atual: str,
    nova_senha: str,
    agora: datetime,
) -> None:
    """Troca de senha do Usuario logado num único ``commit``
    (1.12, 8.4–8.8).

    Ordem:

    1. valida ``nova_senha`` (8 a 128) → ``422 validacao`` com ``newPassword``
       em ``fields``; tem precedência sobre a senha atual errada (8.8);
    2. confere ``senha_atual`` com o Hash_Senha → ``400 senha_atual_incorreta``
       (8.6);
    3. grava ``gerar_hash_senha(nova_senha)`` e ``atualizado_em = agora`` e
       preenche ``revogada_em = agora`` em todas as outras Sessoes não revogadas
       do Usuario; ``sessao_atual`` continua válida (8.4, 8.5). Tudo na mesma
       transação, confirmada por :func:`confirmar`.

    Nas falhas dos passos 1 e 2 nada foi escrito. Se o ``UPDATE`` das Sessoes ou
    o ``commit`` falhar, a transação inteira é desfeita (Hash_Senha e Sessoes
    voltam ao estado anterior) e sobe ``500 falha_ao_salvar``.
    """
    exigir_campos_validos((("new_password", validar_senha(nova_senha)),))
    if not isinstance(senha_atual, str) or not verificar_senha(
        usuario.hash_senha, senha_atual
    ):
        raise ErroDominio(400, "senha_atual_incorreta", MSG_SENHA_ATUAL_INCORRETA)

    novo_hash = gerar_hash_senha(nova_senha)  # antes de escrever: o Argon2 é lento
    try:
        usuario.hash_senha = novo_hash
        usuario.atualizado_em = agora
        db.execute(
            update(Sessao)
            .where(
                Sessao.usuario_id == usuario.id,
                Sessao.id != sessao_atual.id,
                Sessao.revogada_em.is_(None),
            )
            .values(revogada_em=agora)
        )
    except SQLAlchemyError as erro:
        raise _desfazer_e_traduzir(db, erro, CODIGO_FALHA_AO_SALVAR) from erro
    confirmar(db, CODIGO_FALHA_AO_SALVAR)


def para_perfil_publico(usuario: Usuario) -> PerfilPublico:
    """Converte o Usuario no único formato de saída (1.13): sem Hash_Senha e sem
    dados de Sessao."""
    # Import tardio: ``api.py`` importa este módulo.
    from app.autenticacao.api import PerfilPublico

    return PerfilPublico(
        id=usuario.id,
        name=usuario.nome,
        username=usuario.username,
        email=usuario.email,
        description=usuario.descricao,
        photo=usuario.foto,
        is_community_admin=usuario.is_community_admin,
        is_system_admin=usuario.is_system_admin,
        created_at=usuario.criado_em,
        updated_at=usuario.atualizado_em,
    )


# =============================================================================
# Servico_Autenticacao
# =============================================================================
# Autenticar credenciais, criar/validar/revogar Sessoes e Tokens_Redefinicao.
#
# Tokens: ``gerar_token`` e ``hash_token`` são chamados pelo atributo do módulo
# (``seguranca.gerar_token()``), e não importados por nome, para que um teste
# possa trocar o gerador com ``monkeypatch.setattr("app.core.seguranca.gerar_token", ...)``
# (por exemplo, para forçar uma colisão de ``token_hash``).

# Tentativas de gravar a Sessao quando o ``token_hash`` colide com o de outra
# Sessao (2.3). Com 256 bits de aleatoriedade, a segunda já é só garantia.
TENTATIVAS_TOKEN_SESSAO = 3


def _nova_sessao(
    db: Session, usuario_id: str, agora: datetime, ttl: int
) -> tuple[Sessao, str]:
    """Monta uma Sessao nova para ``usuario_id`` e só faz ``db.add`` (sem ``flush``
    nem ``commit``); devolve a Sessao e o Token_Sessao em texto claro.

    Grava apenas ``hash_token(token)`` (2.4), ``criada_em = agora`` e
    ``expira_em = agora + ttl minutos`` (2.5), com ``revogada_em`` vazio (2.1).
    É a peça comum de :func:`criar_sessao` (que confirma) e do gancho de
    ``cadastrar`` (que entra no ``commit`` do Usuario, 4.9). O token não deve
    ser entregue a ninguém antes do ``commit`` dar certo (2.9).
    """
    token = seguranca.gerar_token()
    sessao = Sessao(
        usuario_id=usuario_id,
        token_hash=seguranca.hash_token(token),
        criada_em=agora,
        expira_em=agora + timedelta(minutes=ttl),
        revogada_em=None,
    )
    db.add(sessao)
    return sessao, token


def criar_sessao(
    db: Session, usuario: Usuario, agora: datetime, ttl: int
) -> tuple[Sessao, str]:
    """Cria e confirma uma Sessao para ``usuario`` (já persistido); devolve a
    Sessao e o Token_Sessao em texto claro, a única vez em que ele sai do
    Backend (2.2–2.5).

    Cada tentativa gera um token novo (:func:`_nova_sessao`) e chama
    :func:`confirmar`. Se o ``commit`` bate em ``uq_sessao_token_hash``
    (:class:`ErroTokenSessaoEmUso`), a transação já foi desfeita e a próxima
    tentativa usa outro token, até :data:`TENTATIVAS_TOKEN_SESSAO` vezes.
    Qualquer outra falha (ou as tentativas esgotadas) vira
    ``500 sessao_nao_criada``, sem token devolvido e sem linha parcial (2.9).
    As outras Sessoes do Usuario não são tocadas (2.2).

    A ``db`` deve chegar sem alterações pendentes: o ``rollback`` de uma
    tentativa falha descarta tudo o que estiver pendente nela.
    """
    usuario_id = usuario.id  # lido antes: o rollback expira os atributos
    for _ in range(TENTATIVAS_TOKEN_SESSAO):
        sessao, token = _nova_sessao(db, usuario_id, agora, ttl)
        try:
            confirmar(db, CODIGO_SESSAO_NAO_CRIADA)
        except ErroTokenSessaoEmUso:
            continue
        return sessao, token
    raise ErroDominio(
        500, CODIGO_SESSAO_NAO_CRIADA, _MENSAGENS_FALHA[CODIGO_SESSAO_NAO_CRIADA]
    )


def validar_sessao(db: Session, token: str | None, agora: datetime) -> Sessao | None:
    """Regra da Sessao_Valida (2.6, 9.7): devolve a Sessao cujo ``token_hash``
    confere com ``hash_token(token)``, com ``revogada_em`` vazio e
    ``expira_em > agora`` (estritamente: ``expira_em == agora`` já é inválida).
    Caso contrário, ``None``.

    ``token`` vazio, ``None`` ou de outro tipo devolve ``None`` sem consultar o
    banco. Só leitura. A Sessao devolvida é relida do banco
    (``populate_existing``), então uma revogação feita por outra conexão nunca
    fica escondida por uma cópia antiga na ``db``.
    """
    if not isinstance(token, str) or not token:
        return None
    consulta = (
        select(Sessao)
        .where(
            Sessao.token_hash == seguranca.hash_token(token),
            Sessao.revogada_em.is_(None),
            Sessao.expira_em > agora,
        )
        .execution_options(populate_existing=True)
    )
    return db.scalars(consulta).first()


def revogar_sessao(db: Session, sessao: Sessao, agora: datetime) -> None:
    """Revoga ``sessao`` gravando ``revogada_em = agora`` (2.7, 9.3).

    Idempotente: só escreve quando ``revogada_em`` ainda está vazio. A condição
    fica no próprio ``UPDATE`` (``WHERE revogada_em IS NULL``), então nem uma
    cópia antiga na ``db`` nem uma revogação simultânea sobrescrevem o
    instante original. Só a Sessao indicada é alterada. Falha de persistência →
    ``rollback`` e ``500 falha_ao_salvar``.
    """
    if sessao.revogada_em is not None:
        return  # já revogada: revogada_em nunca volta a ficar vazio
    try:
        db.execute(
            update(Sessao)
            .where(Sessao.id == sessao.id, Sessao.revogada_em.is_(None))
            .values(revogada_em=agora)
            .execution_options(synchronize_session="fetch")
        )
    except SQLAlchemyError as erro:
        raise _desfazer_e_traduzir(db, erro, CODIGO_FALHA_AO_SALVAR) from erro
    confirmar(db, CODIGO_FALHA_AO_SALVAR)


MSG_CREDENCIAIS_INVALIDAS = "E-mail ou senha incorretos."


def _erro_credenciais_invalidas() -> ErroDominio:
    """``401 credenciais_invalidas``: o mesmo código e a mesma mensagem para
    e-mail inexistente e senha errada (3.4)."""
    return ErroDominio(401, "credenciais_invalidas", MSG_CREDENCIAIS_INVALIDAS)


def autenticar(
    db: Session, email: str, senha: str, agora: datetime, ttl: int
) -> tuple[Sessao, str, Usuario]:
    """``autenticar(email, senha)`` do PDF (3.2–3.4): devolve a Sessao criada, o
    Token_Sessao em texto claro e o Usuario.

    Converte o e-mail em Email_Normalizado e busca o Usuario pelo
    Servico_Usuario (:func:`buscar_usuario`). Se ele não existe, a senha é
    conferida contra ``seguranca.HASH_FICTICIO`` antes de lançar
    ``401 credenciais_invalidas``, para que o tempo de resposta não revele se o
    e-mail está cadastrado; senha errada lança o mesmo erro. Só no sucesso
    chama :func:`criar_sessao` (falha → ``500 sessao_nao_criada``); nas falhas
    nada é escrito.

    E-mail ou senha vazios ou de outro tipo nunca lançam outra exceção: viram o
    mesmo 401 (a API já recusa esses casos com 422 antes de chegar aqui).
    """
    # Senha de outro tipo é conferida como "", que nunca confere (o Hash_Senha
    # vem de uma senha de 8 a 128 caracteres), gastando o mesmo tempo.
    senha_conferida = senha if isinstance(senha, str) else ""
    email_normalizado = normalizar_email(email) if isinstance(email, str) else ""
    usuario = buscar_usuario(db, email_normalizado)
    if usuario is None:
        # Pelo atributo do módulo: o conftest troca o HASH_FICTICIO por um rápido.
        verificar_senha(seguranca.HASH_FICTICIO, senha_conferida)
        raise _erro_credenciais_invalidas()
    if not verificar_senha(usuario.hash_senha, senha_conferida):
        raise _erro_credenciais_invalidas()
    sessao, token = criar_sessao(db, usuario, agora, ttl)
    return sessao, token, usuario


def cadastrar(
    db: Session, nome: str, email: str, senha: str, agora: datetime, ttl: int
) -> tuple[Sessao, str, Usuario]:
    """Cadastro com login automático (4.2–4.5, 4.7, 4.9): cria o Usuario e a
    primeira Sessao dele num único ``commit`` e devolve a Sessao, o
    Token_Sessao em texto claro e o Usuario.

    A Sessao entra pelo gancho ``antes_do_commit`` de :func:`criar_usuario`:
    depois do ``flush`` do Usuario, :func:`_nova_sessao` acrescenta a Sessao à
    mesma transação, e o ``commit`` de :func:`criar_usuario` grava os dois ou
    nenhum. O gancho roda de novo a cada tentativa de username, sempre com uma
    Sessao e um token novos; só o par da tentativa confirmada é devolvido.

    Erros (em todos, nem Usuario nem Sessao ficam gravados): ``422 validacao``,
    ``409 email_em_uso`` (inclusive corrida) e ``500 falha_ao_salvar``, o
    código 500 do contrato de ``POST /auth/cadastro``. A colisão de
    ``token_hash`` (:class:`ErroTokenSessaoEmUso`, praticamente impossível com
    256 bits) desfaz a transação inteira; ela é repetida do zero com outro
    token até :data:`TENTATIVAS_TOKEN_SESSAO` vezes e, esgotadas, sobe como
    ``500 falha_ao_salvar``.
    """
    criada: list[tuple[Sessao, str]] = []

    def acrescentar_sessao(usuario: Usuario) -> None:
        criada.clear()
        criada.append(_nova_sessao(db, usuario.id, agora, ttl))

    for _ in range(TENTATIVAS_TOKEN_SESSAO):
        try:
            usuario = criar_usuario(
                db,
                nome,
                email,
                senha,
                agora,
                antes_do_commit=acrescentar_sessao,
                codigo_falha=CODIGO_FALHA_AO_SALVAR,
            )
        except ErroTokenSessaoEmUso:
            continue
        sessao, token = criada[0]
        return sessao, token, usuario
    raise ErroDominio(
        500, CODIGO_FALHA_AO_SALVAR, _MENSAGENS_FALHA[CODIGO_FALHA_AO_SALVAR]
    )


# --- Tokens_Redefinicao -------------------------------------------------------

logger_autenticacao = logging.getLogger("choosen.autenticacao")

# Validade do Token_Redefinicao (5.3).
VALIDADE_TOKEN_REDEFINICAO = timedelta(minutes=30)
# Tentativas de gravar o TokenRedefinicao quando o ``token_hash`` colide (como
# em :data:`TENTATIVAS_TOKEN_SESSAO`).
TENTATIVAS_TOKEN_REDEFINICAO = 3

MSG_TOKEN_INVALIDO = "O link de redefinição é inválido ou expirou."
MSG_NOVA_SENHA_INVALIDA = "A nova senha deve ter de 8 a 128 caracteres."

_trava_saida_log = threading.Lock()
_saida_log_preparada = False


def _preparar_saida_do_log() -> None:
    """Garante que a entrada INFO do link de redefinição apareça no terminal do
    servidor em development (5.4, 16.2).

    O ``uvicorn`` só configura os próprios loggers (``uvicorn.*``): uma entrada
    INFO de ``choosen.autenticacao`` chegaria ao root sem handler, e o
    ``lastResort`` do ``logging`` só mostra WARNING ou acima. Por isso, na
    primeira vez (e só em development, pois só ``pedir_redefinicao`` em
    development chama esta função):

    - se o logger não deixa passar INFO, ele passa a ``INFO``;
    - se nenhum handler receberia a entrada (nem no logger nem nos ancestrais),
      é acrescentado um ``StreamHandler`` (stderr) ao próprio logger.

    Quando já existe handler no caminho (o ``caplog`` do pytest, ou um
    ``--log-config`` que configure o root), nada é acrescentado: a entrada sai
    uma vez só, pelo handler existente.
    """
    global _saida_log_preparada
    if _saida_log_preparada:
        return
    with _trava_saida_log:
        if _saida_log_preparada:
            return
        if not logger_autenticacao.isEnabledFor(logging.INFO):
            logger_autenticacao.setLevel(logging.INFO)
        if not logger_autenticacao.hasHandlers():
            saida = logging.StreamHandler()
            saida.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
            logger_autenticacao.addHandler(saida)
        _saida_log_preparada = True


def link_redefinicao(frontend_url: str, token: str) -> str:
    """Link da Tela_Redefinir_Senha (16.2). O token de ``secrets.token_urlsafe``
    só usa ``[A-Za-z0-9_-]``, então dispensa codificação na URL."""
    return f"{frontend_url}?tela=redefinir-senha&token={token}"


def pedir_redefinicao(
    db: Session, email: str, agora: datetime, config: Configuracao
) -> None:
    """Pedido de redefinição de senha (5.2–5.5, 16.2). Nunca revela se o e-mail
    está cadastrado: não devolve nada e não lança erro de domínio por causa da
    existência do Usuario.

    E-mail que não é Email_Valido (a API já responde 422 antes) ou que não
    pertence a nenhum Usuario: nenhuma escrita, nenhum log.

    Se o Usuario existe, numa única transação:

    1. preenche ``invalidado_em = agora`` nos TokenRedefinicao anteriores dele
       sem ``usado_em`` (e ainda sem ``invalidado_em``, para não sobrescrever o
       instante original);
    2. cria um TokenRedefinicao com ``expira_em = agora + 30 min``, guardando só
       ``hash_token(token)``;
    3. confirma. Colisão em ``uq_token_redefinicao_token_hash`` desfaz tudo e
       tenta de novo com outro token, até :data:`TENTATIVAS_TOKEN_REDEFINICAO`.

    Só depois do ``commit`` e só com ``config.env == "development"``, registra
    exatamente uma entrada INFO no logger ``choosen.autenticacao`` com o e-mail,
    o token e :func:`link_redefinicao` (5.4, 16.2). Fora de development o token
    não aparece em log nenhum (5.5).

    Falha de persistência (ou tentativas esgotadas): ``rollback`` e um WARNING
    sem e-mail nem token, **sem** lançar exceção. Um 500 só aconteceria para
    e-mails cadastrados (os outros não escrevem nada), então revelaria a
    existência do e-mail; o contrato do endpoint também só prevê 202 e 422.
    Erros na leitura inicial (``buscar_usuario``) sobem normalmente: acontecem
    igual para qualquer e-mail e não revelam nada.
    """
    if validar_email(email) is not None:
        return
    usuario = buscar_usuario(db, email)
    if usuario is None:
        return
    usuario_id = usuario.id  # lidos antes: o rollback expira os atributos
    email_usuario = usuario.email

    token: str | None = None
    for _ in range(TENTATIVAS_TOKEN_REDEFINICAO):
        candidato = seguranca.gerar_token()
        try:
            db.execute(
                update(TokenRedefinicao)
                .where(
                    TokenRedefinicao.usuario_id == usuario_id,
                    TokenRedefinicao.usado_em.is_(None),
                    TokenRedefinicao.invalidado_em.is_(None),
                )
                .values(invalidado_em=agora)
                .execution_options(synchronize_session="fetch")
            )
            db.add(
                TokenRedefinicao(
                    usuario_id=usuario_id,
                    token_hash=seguranca.hash_token(candidato),
                    criado_em=agora,
                    expira_em=agora + VALIDADE_TOKEN_REDEFINICAO,
                    usado_em=None,
                    invalidado_em=None,
                )
            )
            db.commit()
        except SQLAlchemyError as erro:
            try:
                db.rollback()
            except SQLAlchemyError:
                pass  # a conexão já está perdida
            if (
                isinstance(erro, IntegrityError)
                and _constraint_violada(erro) == "uq_token_redefinicao_token_hash"
            ):
                continue
            logger_autenticacao.warning(
                "Não foi possível gravar o pedido de redefinição de senha (%s).",
                type(erro).__name__,
            )
            return
        token = candidato
        break

    if token is None:
        logger_autenticacao.warning(
            "Não foi possível gravar o pedido de redefinição de senha "
            "(colisões de token esgotadas)."
        )
        return

    if config.env == "development":
        _preparar_saida_do_log()
        logger_autenticacao.info(
            "Redefinição de senha pedida para %s. Token: %s. Link: %s",
            email_usuario,
            token,
            link_redefinicao(config.frontend_url, token),
        )


def _erro_token_invalido() -> ErroDominio:
    return ErroDominio(400, "token_invalido", MSG_TOKEN_INVALIDO)


def confirmar_redefinicao(
    db: Session, token: str, nova_senha: str, agora: datetime
) -> None:
    """Confirmação da redefinição (5.6, 5.7, 5.10).

    Ordem (a primeira falha decide):

    1. ``400 token_invalido`` se ``token`` é vazio ou de outro tipo, se não há
       TokenRedefinicao com ``hash_token(token)``, se ele tem ``usado_em`` ou
       ``invalidado_em`` preenchido, se ``expira_em <= agora`` ou se o Usuario
       dele não existe mais. Tem precedência sobre a senha (5.7);
    2. ``400 senha_invalida`` se ``nova_senha`` está fora de 8 a 128
       caracteres; o token continua utilizável (5.10);
    3. numa única transação: troca o Hash_Senha (e ``atualizado_em = agora``),
       preenche ``usado_em = agora`` e ``revogada_em = agora`` em todas as
       Sessoes não revogadas do Usuario (5.6).

    ``usado_em`` é gravado com um ``UPDATE`` condicional (ainda não usado, não
    invalidado e não expirado): se outra confirmação simultânea usou o mesmo
    token primeiro, nenhuma linha muda, a transação é desfeita e sobe
    ``400 token_invalido``. Nas falhas 1 e 2 nada é escrito; falha de
    persistência → ``rollback`` (nada muda) e ``500 falha_ao_salvar``.
    """
    if not isinstance(token, str) or not token:
        raise _erro_token_invalido()
    registro = db.scalars(
        select(TokenRedefinicao)
        .where(TokenRedefinicao.token_hash == seguranca.hash_token(token))
        .execution_options(populate_existing=True)
    ).first()
    if (
        registro is None
        or registro.usado_em is not None
        or registro.invalidado_em is not None
        or registro.expira_em <= agora
    ):
        raise _erro_token_invalido()
    if validar_senha(nova_senha) is not None:
        raise ErroDominio(400, "senha_invalida", MSG_NOVA_SENHA_INVALIDA)
    usuario = db.get(Usuario, registro.usuario_id)
    if usuario is None:
        raise _erro_token_invalido()

    novo_hash = gerar_hash_senha(nova_senha)  # antes de escrever: o Argon2 é lento
    try:
        marcado = db.execute(
            update(TokenRedefinicao)
            .where(
                TokenRedefinicao.id == registro.id,
                TokenRedefinicao.usado_em.is_(None),
                TokenRedefinicao.invalidado_em.is_(None),
                TokenRedefinicao.expira_em > agora,
            )
            .values(usado_em=agora)
            .execution_options(synchronize_session="fetch")
        )
        if marcado.rowcount != 1:
            db.rollback()
            raise _erro_token_invalido()
        usuario.hash_senha = novo_hash
        usuario.atualizado_em = agora
        db.execute(
            update(Sessao)
            .where(Sessao.usuario_id == usuario.id, Sessao.revogada_em.is_(None))
            .values(revogada_em=agora)
            .execution_options(synchronize_session="fetch")
        )
    except SQLAlchemyError as erro:
        raise _desfazer_e_traduzir(db, erro, CODIGO_FALHA_AO_SALVAR) from erro
    confirmar(db, CODIGO_FALHA_AO_SALVAR)
