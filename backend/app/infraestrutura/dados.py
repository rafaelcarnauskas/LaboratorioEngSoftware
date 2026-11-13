"""API de Dados Compartilhados: único caminho até o banco ``choosen_compartilhado``.

:class:`ServidorDadosCompartilhados` é o lado da infraestrutura. Toda operação
recebe o serviço que chama e confere a tabela ``permissao`` antes de executar:

- ``obter`` / ``listar`` exigem ``pode_ler``;
- ``gravar`` e as mensagens aplicadas por :meth:`aplicar_mensagem` exigem
  ``pode_escrever`` do serviço de origem (só o dono da tabela tem).

Entrada e saída são só tipos JSON (``dict``, ``list``, ``str``...). Os serviços
chegam aqui pelo cliente de :mod:`app.infraestrutura.cliente`, em processo ou
por HTTP (:mod:`app.infraestrutura.api`).
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import DataHoraTZ
from app.infraestrutura import catalogo
from app.infraestrutura.modelo import (
    Assinatura,
    ComunidadePublica,
    NichoPublico,
    Permissao,
    Servico,
    UsuarioPublico,
    VideoPublico,
)
from app.mensageria import (
    COMUNIDADE_ATUALIZADA,
    COMUNIDADE_CRIADA,
    MEMBRO_ENTROU,
    MEMBRO_SAIU,
    PERFIL_ATUALIZADO,
    USUARIO_CADASTRADO,
    USUARIO_REMOVIDO,
    VIDEO_ATUALIZADO,
    VIDEO_PUBLICADO,
    VIDEO_REMOVIDO,
    Mensagem,
    instante_iso,
    ler_instante,
)

# Tabelas que a API expõe. As da infraestrutura não têm linha em ``permissao``.
TABELAS = {
    catalogo.USUARIO_PUBLICO: UsuarioPublico,
    catalogo.COMUNIDADE_PUBLICA: ComunidadePublica,
    catalogo.NICHO_PUBLICO: NichoPublico,
    catalogo.VIDEO_PUBLICO: VideoPublico,
}
LIMITE_LISTAGEM = 500


class AcessoNegado(PermissionError):
    """O serviço não tem a permissão pedida sobre a tabela."""


class TabelaDesconhecida(LookupError):
    pass


def hash_credencial(credencial: str) -> str:
    return hashlib.sha256(credencial.encode("utf-8")).hexdigest()


def _para_json(valor):
    if isinstance(valor, datetime):
        return instante_iso(valor)
    return valor


def _linha_para_dict(linha) -> dict:
    return {c.key: _para_json(getattr(linha, c.key)) for c in linha.__table__.columns}


def _modelo(tabela: str):
    modelo = TABELAS.get(tabela)
    if modelo is None:
        raise TabelaDesconhecida(tabela)
    return modelo


def _valores_da_tabela(modelo, dados: dict) -> dict:
    """Só as colunas da tabela; datas em texto viram ``datetime``."""
    valores = {}
    for coluna in modelo.__table__.columns:
        if coluna.key not in dados:
            continue
        valor = dados[coluna.key]
        if isinstance(coluna.type, DataHoraTZ) and isinstance(valor, str):
            valor = ler_instante(valor)
        valores[coluna.key] = valor
    return valores


def _mais_antigo(atual, dados: dict) -> bool:
    """``True`` quando a mensagem é mais velha que a linha (entregue fora de ordem)."""
    if atual is None or "atualizado_em" not in dados:
        return False
    return atual.atualizado_em > ler_instante(dados["atualizado_em"])


class ServidorDadosCompartilhados:
    def __init__(self, engine: Engine) -> None:
        self._fabrica = sessionmaker(bind=engine)

    # --- controle de acesso -------------------------------------------------

    def _permissao(self, sessao: Session, servico_id: str, tabela: str) -> Permissao | None:
        servico = sessao.get(Servico, servico_id)
        if servico is None or not servico.ativo:
            return None
        return sessao.get(Permissao, (servico_id, tabela))

    def _exigir(self, sessao: Session, servico_id: str, tabela: str, escrever: bool) -> None:
        _modelo(tabela)
        permissao = self._permissao(sessao, servico_id, tabela)
        permitido = permissao is not None and (permissao.pode_escrever if escrever else permissao.pode_ler)
        if not permitido:
            acao = "escrever em" if escrever else "ler"
            raise AcessoNegado(f"O serviço {servico_id} não pode {acao} {tabela}.")

    def autenticar(self, servico_id: str, credencial: str) -> bool:
        """Confere a credencial de quem chama pela API HTTP."""
        with self._fabrica() as sessao:
            servico = sessao.get(Servico, servico_id)
            if servico is None or not servico.ativo or not servico.hash_credencial:
                return False
            return hmac.compare_digest(servico.hash_credencial, hash_credencial(credencial))

    # --- operações da API ----------------------------------------------------

    def obter(self, servico_id: str, tabela: str, chave: str) -> dict | None:
        with self._fabrica() as sessao:
            self._exigir(sessao, servico_id, tabela, escrever=False)
            linha = sessao.get(_modelo(tabela), chave)
            return None if linha is None else _linha_para_dict(linha)

    def listar(self, servico_id: str, tabela: str, filtros: dict[str, list] | None = None,
               limite: int = LIMITE_LISTAGEM) -> list[dict]:
        """Linhas cujas colunas estão entre os valores pedidos (``{"coluna": [v1, v2]}``)."""
        modelo = _modelo(tabela)
        consulta = select(modelo)
        for coluna, valores in (filtros or {}).items():
            if coluna not in modelo.__table__.columns:
                raise ValueError(f"Coluna desconhecida em {tabela}: {coluna}")
            if not isinstance(valores, (list, tuple)):
                valores = [valores]
            consulta = consulta.where(modelo.__table__.columns[coluna].in_(list(valores)))
        chaves = list(modelo.__table__.primary_key.columns)
        consulta = consulta.order_by(*chaves).limit(min(max(limite, 1), LIMITE_LISTAGEM))
        with self._fabrica() as sessao:
            self._exigir(sessao, servico_id, tabela, escrever=False)
            return [_linha_para_dict(l) for l in sessao.scalars(consulta)]

    def gravar(self, servico_id: str, tabela: str, dados: dict) -> dict:
        """Cria ou atualiza uma linha. Só o dono da tabela pode."""
        modelo = _modelo(tabela)
        with self._fabrica.begin() as sessao:
            self._exigir(sessao, servico_id, tabela, escrever=True)
            linha = sessao.merge(modelo(**_valores_da_tabela(modelo, dados)))
            sessao.flush()
            return _linha_para_dict(linha)

    # --- mensagens -------------------------------------------------------------

    def aplicar_mensagem(self, mensagem: Mensagem) -> None:
        """Consumidor da infraestrutura: mantém as tabelas compartilhadas atualizadas.

        A escrita vale em nome do serviço de origem, que precisa ser o dono da tabela."""
        aplicar = {
            USUARIO_CADASTRADO: self._usuario_publicado,
            PERFIL_ATUALIZADO: self._usuario_publicado,
            USUARIO_REMOVIDO: self._usuario_removido,
            COMUNIDADE_CRIADA: self._comunidade_publicada,
            COMUNIDADE_ATUALIZADA: self._comunidade_publicada,
            MEMBRO_ENTROU: self._membros_alterados,
            MEMBRO_SAIU: self._membros_alterados,
            VIDEO_PUBLICADO: self._video_publicado,
            VIDEO_ATUALIZADO: self._video_publicado,
            VIDEO_REMOVIDO: self._video_removido,
        }.get(mensagem.tipo)
        if aplicar is None:
            return
        with self._fabrica.begin() as sessao:
            aplicar(sessao, mensagem.servico_origem, mensagem.conteudo)

    def _upsert(self, sessao: Session, origem: str, tabela: str, dados: dict) -> None:
        self._exigir(sessao, origem, tabela, escrever=True)
        modelo = _modelo(tabela)
        valores = _valores_da_tabela(modelo, dados)
        chave = tuple(valores[c.key] for c in modelo.__table__.primary_key.columns)
        atual = sessao.get(modelo, chave if len(chave) > 1 else chave[0], with_for_update=True)
        if _mais_antigo(atual, dados):
            return
        sessao.merge(modelo(**valores))

    def _usuario_publicado(self, sessao, origem, dados):
        self._upsert(sessao, origem, catalogo.USUARIO_PUBLICO, dados)

    def _usuario_removido(self, sessao, origem, dados):
        self._exigir(sessao, origem, catalogo.USUARIO_PUBLICO, escrever=True)
        # Os vídeos do autor saem junto (ON DELETE CASCADE em video_publico.autor_id).
        sessao.execute(delete(VideoPublico).where(VideoPublico.autor_id == dados["usuario_id"]))
        sessao.execute(delete(UsuarioPublico).where(UsuarioPublico.usuario_id == dados["usuario_id"]))

    def _comunidade_publicada(self, sessao, origem, dados):
        self._exigir(sessao, origem, catalogo.NICHO_PUBLICO, escrever=True)
        atual = sessao.get(ComunidadePublica, dados["comunidade_id"])
        if _mais_antigo(atual, dados):
            return
        self._upsert(sessao, origem, catalogo.COMUNIDADE_PUBLICA, dados)
        sessao.flush()
        nichos = {n["nicho_id"]: n for n in dados.get("nichos", [])}
        sessao.execute(delete(NichoPublico).where(
            NichoPublico.comunidade_id == dados["comunidade_id"],
            NichoPublico.nicho_id.not_in(list(nichos) or [""]),
        ))
        for nicho in nichos.values():
            sessao.merge(NichoPublico(nicho_id=nicho["nicho_id"], comunidade_id=dados["comunidade_id"],
                                      nome=nicho["nome"]))

    def _membros_alterados(self, sessao, origem, dados):
        self._exigir(sessao, origem, catalogo.COMUNIDADE_PUBLICA, escrever=True)
        comunidade = sessao.get(ComunidadePublica, dados["comunidade_id"], with_for_update=True)
        if comunidade is None:
            raise LookupError(f"comunidade_publica {dados['comunidade_id']} ainda não existe")
        if _mais_antigo(comunidade, dados):
            return
        comunidade.quantidade_membros = int(dados["quantidade_membros"])
        comunidade.atualizado_em = ler_instante(dados["atualizado_em"])

    def _video_publicado(self, sessao, origem, dados):
        self._upsert(sessao, origem, catalogo.VIDEO_PUBLICO, dados)

    def _video_removido(self, sessao, origem, dados):
        self._exigir(sessao, origem, catalogo.VIDEO_PUBLICO, escrever=True)
        sessao.execute(delete(VideoPublico).where(VideoPublico.video_id == dados["video_id"]))

    # --- registro dos serviços -------------------------------------------------

    def registrar_servicos(self, credenciais: dict[str, str] | None = None,
                           urls: dict[str, str] | None = None) -> None:
        """Grava ``servico``, ``permissao`` e ``assinatura`` a partir de :mod:`catalogo`.

        ``credenciais`` (servico_id → credencial em texto) só atualiza quem foi
        informado; os demais mantêm o hash atual (ou nenhum)."""
        credenciais = credenciais or {}
        urls = urls or {}
        with self._fabrica.begin() as sessao:
            for servico_id, nome in catalogo.SERVICOS.items():
                servico = sessao.get(Servico, servico_id)
                if servico is None:
                    servico = Servico(servico_id=servico_id, nome=nome, ativo=True)
                    sessao.add(servico)
                servico.nome = nome
                if servico_id in urls:
                    servico.url_base = urls[servico_id]
                if credenciais.get(servico_id):
                    servico.hash_credencial = hash_credencial(credenciais[servico_id])
            sessao.flush()
            sessao.execute(delete(Permissao))
            sessao.add_all(Permissao(servico_id=s, tabela=t, pode_ler=l, pode_escrever=e)
                           for s, t, l, e in catalogo.permissoes())
            sessao.execute(delete(Assinatura))
            sessao.add_all(Assinatura(servico_id=s, tipo_mensagem=tipo)
                           for tipo, assinantes in catalogo.ASSINATURAS.items() for s in assinantes)
