# Regras do Serviço de Busca e do Serviço de Listas (parte 4).
# Mesmas regras de frontend/src/4-busca-listas (SearchView.jsx, ListsView.jsx e useLists.js).
# A busca consulta o Serviço de Vídeos (parte 3); nunca acessa os dados de vídeo direto.
import re
import unicodedata
import uuid

from .modelo import Lista

TONS = ("gold", "blue", "green", "purple")
MAX_NOME = 60
MAX_DESCRICAO = 180
MAX_VIDEOS_POR_LISTA = 500
DURACOES = ("any", "short", "long")
ORDENS = ("featured", "title", "shortest")
LIMITE_CURTO = 60  # segundos: "1 minuto ou menos"


class ListaNaoEncontrada(LookupError):
    pass


class ItemDuplicado(ValueError):
    """O vídeo já está na lista (regra do diagrama: valida duplicidade)."""


class ListaJaExiste(ValueError):
    """O id de lista enviado pelo front já está em uso por este usuário."""


ID_VALIDO = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


# --- Serviço de Busca ---

def normalizar(texto):
    sem_acento = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in sem_acento if unicodedata.category(c) != "Mn").casefold().strip()


def segundos_do_video(video):
    """Duração em segundos, ou None se o Vídeo ainda não informa duração.

    Aceita `duration` como inteiro (segundos) ou texto "m:ss", como no front.
    """
    duracao = getattr(video, "duration", None)
    if duracao is None:
        return None
    if isinstance(duracao, (int, float)):
        return int(duracao)
    try:
        total = 0
        for parte in str(duracao).split(":"):
            total = total * 60 + int(parte)
        return total
    except ValueError:
        return None


def _casa_duracao(video, duracao):
    if duracao == "any":
        return True
    segundos = segundos_do_video(video)
    if segundos is None:
        return False  # sem duração conhecida não dá para afirmar curto/longo
    return segundos <= LIMITE_CURTO if duracao == "short" else segundos > LIMITE_CURTO


def pesquisar(videos, termo="", categoria=None, duracao="any", ordem="featured"):
    """`videos` é o Serviço de Vídeos. Todos os termos precisam aparecer no texto."""
    if duracao not in DURACOES:
        raise ValueError("duração inválida")
    if ordem not in ORDENS:
        raise ValueError("ordem inválida")
    termos = normalizar(termo).split()
    categoria = (categoria or "").strip() or None
    resultado = [
        v for v in videos.list_videos(category=categoria)
        if all(t in normalizar(f"{v.title} {v.author} {v.category}") for t in termos)
        and _casa_duracao(v, duracao)
    ]
    if ordem == "title":
        resultado.sort(key=lambda v: normalizar(v.title))
    elif ordem == "shortest":
        # vídeos sem duração vão para o fim, mantendo a ordem do catálogo
        resultado.sort(key=lambda v: (segundos_do_video(v) is None, segundos_do_video(v) or 0))
    return resultado


# --- Serviço de Listas ---

def _validar_campos(nome, descricao, tom):
    nome = (nome or "").strip()
    descricao = (descricao or "").strip()
    if not nome:
        raise ValueError("nome vazio")
    if len(nome) > MAX_NOME:
        raise ValueError("nome longo demais")
    if len(descricao) > MAX_DESCRICAO:
        raise ValueError("descrição longa demais")
    if tom not in TONS:
        raise ValueError("tom inválido")
    return nome, descricao


def _novo_id(nome):
    base = re.sub(r"[^a-z0-9]+", "-", normalizar(nome)).strip("-")[:40] or "lista"
    return f"{base}-{uuid.uuid4().hex[:8]}"


def _buscar(repo, usuario, lista_id):
    lista = repo.lista(usuario, lista_id)
    if lista is None:
        raise ListaNaoEncontrada(lista_id)
    return lista


def listar(repo, usuario):
    return sorted(repo.listas(usuario), key=lambda lista: lista.atualizado_em, reverse=True)


def obter(repo, usuario, lista_id):
    return _buscar(repo, usuario, lista_id)


def criar_lista(repo, usuario, nome, descricao, tom, agora, lista_id=None):
    """`lista_id` é opcional: o front gera o id para funcionar offline e sincronizar depois."""
    nome, descricao = _validar_campos(nome, descricao, tom)
    if lista_id is None:
        lista_id = _novo_id(nome)
    elif not ID_VALIDO.fullmatch(lista_id):
        raise ValueError("id de lista inválido")
    elif repo.lista(usuario, lista_id) is not None:
        raise ListaJaExiste(lista_id)
    lista = Lista(lista_id, nome, descricao, tom, (), agora)
    repo.salvar_lista(usuario, lista)
    return lista


def editar_lista(repo, usuario, lista_id, agora, nome=None, descricao=None, tom=None):
    atual = _buscar(repo, usuario, lista_id)
    tom = atual.tom if tom is None else tom
    nome, descricao = _validar_campos(
        atual.nome if nome is None else nome,
        atual.descricao if descricao is None else descricao,
        tom,
    )
    lista = Lista(atual.id, nome, descricao, tom, atual.video_ids, agora)
    repo.salvar_lista(usuario, lista)
    return lista


def apagar_lista(repo, usuario, lista_id):
    _buscar(repo, usuario, lista_id)
    repo.apagar_lista(usuario, lista_id)


def adicionar_item(repo, videos, usuario, lista_id, video_id, agora):
    """adicionarItem(usuário, lista, vídeo) do diagrama de sequência."""
    lista = _buscar(repo, usuario, lista_id)
    videos.get_video(video_id)  # VideoNotFoundError se o vídeo não existir
    if video_id in lista.video_ids:
        raise ItemDuplicado(video_id)
    if len(lista.video_ids) >= MAX_VIDEOS_POR_LISTA:
        raise ValueError("lista cheia")
    nova = Lista(lista.id, lista.nome, lista.descricao, lista.tom,
                 (*lista.video_ids, video_id), agora)
    repo.salvar_lista(usuario, nova)
    return nova


def remover_item(repo, usuario, lista_id, video_id, agora):
    lista = _buscar(repo, usuario, lista_id)
    if video_id not in lista.video_ids:
        raise ListaNaoEncontrada(f"{lista_id}/{video_id}")
    nova = Lista(lista.id, lista.nome, lista.descricao, lista.tom,
                 tuple(v for v in lista.video_ids if v != video_id), agora)
    repo.salvar_lista(usuario, nova)
    return nova


def definir_listas_do_video(repo, videos, usuario, video_id, lista_ids, agora):
    """Modal "Salvar em uma lista" da Busca: o vídeo fica exatamente nas listas marcadas."""
    videos.get_video(video_id)
    marcadas = set(lista_ids)
    existentes = {lista.id: lista for lista in repo.listas(usuario)}
    faltando = marcadas - existentes.keys()
    if faltando:
        raise ListaNaoEncontrada(", ".join(sorted(faltando)))
    for lista in existentes.values():
        dentro = video_id in lista.video_ids
        if lista.id in marcadas and not dentro:
            adicionar_item(repo, videos, usuario, lista.id, video_id, agora)
        elif lista.id not in marcadas and dentro:
            remover_item(repo, usuario, lista.id, video_id, agora)
    return listar(repo, usuario)
