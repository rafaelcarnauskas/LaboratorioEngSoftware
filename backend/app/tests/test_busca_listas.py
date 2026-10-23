from dataclasses import dataclass

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.busca_listas import api, servico
from app.busca_listas.modelo import RepositorioMemoria, RepositorioSQL
from app.db.base import criar_engine
from app.videos.modelo import MockVideoRepository
from app.videos.servico import VideoNotFoundError, VideoService

AGORA = 1_760_000_000_000
USUARIO = {"X-Usuario": "murilo@email.com"}
OUTRO = {"X-Usuario": "victor@email.com"}


# Vídeo de teste com `duration`: o campo que a parte 3 está adicionando.
@dataclass(frozen=True)
class VideoTeste:
    id: str
    title: str
    author: str
    category: str
    duration: str | int | None = None
    community_id: str = "poli-usp"
    image: str | None = None


CATALOGO = (
    VideoTeste("v1", "Final do basquete — Interusp", "@poli", "sports", "1:30"),
    VideoTeste("v2", "Aniversário da princesinha", "@rafael", "cute", "0:42"),
    VideoTeste("v3", "Treino de judô", "@sosomariano", "sports", 55),
    VideoTeste("v4", "Atalhos de programação", "@codequick", "tips"),  # sem duração
)


@pytest.fixture
def videos():
    return VideoService(MockVideoRepository(CATALOGO))


@pytest.fixture(params=["memoria", "sqlite"])
def repo(request):
    if request.param == "memoria":
        return RepositorioMemoria()
    return RepositorioSQL(criar_engine("sqlite://"))


@pytest.fixture
def cliente(repo, videos):
    app = FastAPI()
    app.include_router(api.router)
    app.dependency_overrides[api.get_repositorio] = lambda: repo
    app.dependency_overrides[api.get_videos] = lambda: videos
    app.dependency_overrides[api.get_agora] = lambda: AGORA
    return TestClient(app)


def ids(videos):
    return [v.id for v in videos]


# --- Serviço de Busca ---

def test_busca_sem_filtros_devolve_o_catalogo_na_ordem(videos):
    assert ids(servico.pesquisar(videos)) == ["v1", "v2", "v3", "v4"]


def test_busca_ignora_acentos_e_maiusculas(videos):
    assert ids(servico.pesquisar(videos, "ANIVERSARIO")) == ["v2"]
    assert ids(servico.pesquisar(videos, "judo")) == ["v3"]


def test_busca_exige_todos_os_termos_no_titulo_autor_ou_categoria(videos):
    assert ids(servico.pesquisar(videos, "basquete poli")) == ["v1"]
    assert ids(servico.pesquisar(videos, "basquete judo")) == []
    assert ids(servico.pesquisar(videos, "sports")) == ["v1", "v3"]


def test_busca_por_categoria(videos):
    assert ids(servico.pesquisar(videos, categoria="Sports")) == ["v1", "v3"]


def test_busca_por_duracao(videos):
    assert ids(servico.pesquisar(videos, duracao="short")) == ["v2", "v3"]
    assert ids(servico.pesquisar(videos, duracao="long")) == ["v1"]


def test_video_sem_duracao_so_aparece_em_qualquer_duracao(videos):
    assert "v4" in ids(servico.pesquisar(videos, duracao="any"))
    assert "v4" not in ids(servico.pesquisar(videos, duracao="short"))
    assert "v4" not in ids(servico.pesquisar(videos, duracao="long"))


def test_ordenacao(videos):
    assert ids(servico.pesquisar(videos, ordem="title")) == ["v2", "v4", "v1", "v3"]
    assert ids(servico.pesquisar(videos, ordem="shortest")) == ["v2", "v3", "v1", "v4"]


def test_busca_rejeita_filtro_invalido(videos):
    with pytest.raises(ValueError):
        servico.pesquisar(videos, duracao="media")


def test_segundos_do_video():
    assert servico.segundos_do_video(VideoTeste("a", "", "", "", "1:05")) == 65
    assert servico.segundos_do_video(VideoTeste("a", "", "", "", 42)) == 42
    assert servico.segundos_do_video(VideoTeste("a", "", "", "", None)) is None
    assert servico.segundos_do_video(VideoTeste("a", "", "", "", "x")) is None


def test_busca_funciona_com_o_catalogo_real_da_parte_3():
    reais = VideoService(MockVideoRepository())
    assert ids(servico.pesquisar(reais, "basquete"))  # acha os vídeos da Interusp


# --- Serviço de Listas ---

def test_criar_e_listar_por_usuario(repo):
    lista = servico.criar_lista(repo, "murilo", "  Assistir depois ", "Para mais tarde", "gold", AGORA)
    assert lista.nome == "Assistir depois"
    assert lista.video_ids == ()
    assert servico.listar(repo, "murilo") == [lista]
    assert servico.listar(repo, "victor") == []


def test_criar_valida_campos(repo):
    for nome, descricao, tom in [("", "", "gold"), ("   ", "", "gold"), ("x" * 61, "", "gold"),
                                 ("ok", "x" * 181, "gold"), ("ok", "", "rosa")]:
        with pytest.raises(ValueError):
            servico.criar_lista(repo, "murilo", nome, descricao, tom, AGORA)


def test_ids_de_lista_sao_unicos_mesmo_com_nome_igual(repo):
    a = servico.criar_lista(repo, "murilo", "Favoritos", "", "gold", AGORA)
    b = servico.criar_lista(repo, "murilo", "Favoritos", "", "gold", AGORA)
    assert a.id != b.id
    assert a.id.startswith("favoritos-")


def test_listar_mais_recente_primeiro(repo):
    antiga = servico.criar_lista(repo, "murilo", "Antiga", "", "gold", AGORA)
    nova = servico.criar_lista(repo, "murilo", "Nova", "", "blue", AGORA + 1)
    assert [lista.id for lista in servico.listar(repo, "murilo")] == [nova.id, antiga.id]


def test_adicionar_item_valida_duplicidade(repo, videos):
    lista = servico.criar_lista(repo, "murilo", "Favoritos", "", "gold", AGORA)
    lista = servico.adicionar_item(repo, videos, "murilo", lista.id, "v1", AGORA + 1)
    lista = servico.adicionar_item(repo, videos, "murilo", lista.id, "v3", AGORA + 2)
    assert lista.video_ids == ("v1", "v3")
    assert lista.atualizado_em == AGORA + 2
    with pytest.raises(servico.ItemDuplicado):
        servico.adicionar_item(repo, videos, "murilo", lista.id, "v1", AGORA + 3)
    assert servico.obter(repo, "murilo", lista.id).video_ids == ("v1", "v3")


def test_adicionar_item_exige_video_existente(repo, videos):
    lista = servico.criar_lista(repo, "murilo", "Favoritos", "", "gold", AGORA)
    with pytest.raises(VideoNotFoundError):
        servico.adicionar_item(repo, videos, "murilo", lista.id, "nao-existe", AGORA)


def test_lista_de_outro_usuario_nao_e_encontrada(repo, videos):
    lista = servico.criar_lista(repo, "murilo", "Favoritos", "", "gold", AGORA)
    with pytest.raises(servico.ListaNaoEncontrada):
        servico.adicionar_item(repo, videos, "victor", lista.id, "v1", AGORA)


def test_remover_item_e_apagar_lista(repo, videos):
    lista = servico.criar_lista(repo, "murilo", "Favoritos", "", "gold", AGORA)
    servico.adicionar_item(repo, videos, "murilo", lista.id, "v1", AGORA)
    servico.adicionar_item(repo, videos, "murilo", lista.id, "v2", AGORA)
    assert servico.remover_item(repo, "murilo", lista.id, "v1", AGORA).video_ids == ("v2",)
    with pytest.raises(servico.ListaNaoEncontrada):
        servico.remover_item(repo, "murilo", lista.id, "v1", AGORA)
    servico.apagar_lista(repo, "murilo", lista.id)
    assert servico.listar(repo, "murilo") == []
    with pytest.raises(servico.ListaNaoEncontrada):
        servico.apagar_lista(repo, "murilo", lista.id)


def test_editar_mantem_itens_e_campos_nao_enviados(repo, videos):
    lista = servico.criar_lista(repo, "murilo", "Favoritos", "Os melhores", "gold", AGORA)
    servico.adicionar_item(repo, videos, "murilo", lista.id, "v1", AGORA)
    editada = servico.editar_lista(repo, "murilo", lista.id, AGORA + 5, tom="green")
    assert (editada.nome, editada.descricao, editada.tom) == ("Favoritos", "Os melhores", "green")
    assert editada.video_ids == ("v1",)
    with pytest.raises(ValueError):
        servico.editar_lista(repo, "murilo", lista.id, AGORA, nome="  ")


def test_definir_listas_do_video(repo, videos):
    a = servico.criar_lista(repo, "murilo", "A", "", "gold", AGORA)
    b = servico.criar_lista(repo, "murilo", "B", "", "blue", AGORA)
    servico.adicionar_item(repo, videos, "murilo", a.id, "v1", AGORA)
    servico.definir_listas_do_video(repo, videos, "murilo", "v1", [b.id], AGORA + 1)
    assert servico.obter(repo, "murilo", a.id).video_ids == ()
    assert servico.obter(repo, "murilo", b.id).video_ids == ("v1",)
    with pytest.raises(servico.ListaNaoEncontrada):
        servico.definir_listas_do_video(repo, videos, "murilo", "v1", ["nao-existe"], AGORA)


# --- API ---

def test_api_exige_usuario(cliente):
    assert cliente.get("/api/v1/listas").status_code == 401


def test_api_busca_nao_exige_usuario(cliente):
    r = cliente.get("/api/v1/busca", params={"termo": "judo", "duracao": "short"})
    assert r.status_code == 200
    assert r.json() == [{
        "id": "v3", "title": "Treino de judô", "creator": "@sosomariano", "category": "sports",
        "communityId": "poli-usp", "image": None, "durationSeconds": 55,
    }]
    assert cliente.get("/api/v1/busca", params={"duracao": "media"}).status_code == 422


def test_api_fluxo_do_diagrama_de_sequencia(cliente):
    criada = cliente.post("/api/v1/listas", headers=USUARIO,
                          json={"name": "Assistir depois", "tone": "blue"})
    assert criada.status_code == 201
    lista_id = criada.json()["id"]

    salvo = cliente.post(f"/api/v1/listas/{lista_id}/itens", headers=USUARIO, json={"videoId": "v1"})
    assert salvo.status_code == 201
    assert salvo.json()["videoIds"] == ["v1"]
    assert salvo.json()["updatedAt"] == AGORA

    duplicado = cliente.post(f"/api/v1/listas/{lista_id}/itens", headers=USUARIO, json={"videoId": "v1"})
    assert duplicado.status_code == 409

    assert cliente.get("/api/v1/listas", headers=OUTRO).json() == []
    assert cliente.get(f"/api/v1/listas/{lista_id}", headers=OUTRO).status_code == 404


def test_api_erros_de_validacao(cliente):
    assert cliente.post("/api/v1/listas", headers=USUARIO, json={"name": ""}).status_code == 422
    assert cliente.post("/api/v1/listas", headers=USUARIO,
                        json={"name": "ok", "tone": "rosa"}).status_code == 422
    assert cliente.post("/api/v1/listas", headers=USUARIO, json={"name": "   "}).status_code == 422
    lista_id = cliente.post("/api/v1/listas", headers=USUARIO, json={"name": "ok"}).json()["id"]
    r = cliente.post(f"/api/v1/listas/{lista_id}/itens", headers=USUARIO, json={"videoId": "x"})
    assert r.status_code == 404


def test_api_editar_remover_e_apagar(cliente):
    lista_id = cliente.post("/api/v1/listas", headers=USUARIO, json={"name": "ok"}).json()["id"]
    cliente.post(f"/api/v1/listas/{lista_id}/itens", headers=USUARIO, json={"videoId": "v2"})

    editada = cliente.patch(f"/api/v1/listas/{lista_id}", headers=USUARIO, json={"name": "Pets"})
    assert editada.json()["name"] == "Pets"
    assert editada.json()["videoIds"] == ["v2"]

    removido = cliente.delete(f"/api/v1/listas/{lista_id}/itens/v2", headers=USUARIO)
    assert removido.json()["videoIds"] == []

    assert cliente.delete(f"/api/v1/listas/{lista_id}", headers=USUARIO).status_code == 204
    assert cliente.get("/api/v1/listas", headers=USUARIO).json() == []


def test_api_modal_salvar_em_listas(cliente):
    a = cliente.post("/api/v1/listas", headers=USUARIO, json={"name": "A"}).json()["id"]
    b = cliente.post("/api/v1/listas", headers=USUARIO, json={"name": "B"}).json()["id"]
    r = cliente.put("/api/v1/videos/v1/listas", headers=USUARIO, json={"listIds": [a, b]})
    assert r.status_code == 200
    assert all(lista["videoIds"] == ["v1"] for lista in r.json())
    r = cliente.put("/api/v1/videos/v1/listas", headers=USUARIO, json={"listIds": [b]})
    por_id = {lista["id"]: lista["videoIds"] for lista in r.json()}
    assert por_id == {a: [], b: ["v1"]}
