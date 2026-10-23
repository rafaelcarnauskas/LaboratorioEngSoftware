"""Entidade de vídeo e repositório mockado do contexto de Vídeos."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence


@dataclass(frozen=True, slots=True)
class Video:
    id: str
    title: str
    category: str
    community_id: str
    niche_id: str
    author: str
    avatar: str | None
    image: str | None
    caption: str
    likes: int
    comment_count: int
    posted_at: str
    duration: int
    media_url: str | None = None


class VideoRepository(Protocol):
    """Contrato de consulta que poderá receber uma implementação com banco."""

    def list_videos(
        self,
        *,
        category: str | None = None,
        community_id: str | None = None,
        niche_ids: Sequence[str] = (),
    ) -> list[Video]: ...

    def get_video(self, video_id: str) -> Video | None: ...


class MockVideoRepository:
    """Catálogo em memória para a etapa inicial do projeto.

    Recebe registros customizados quando necessário, mas não escreve no disco.
    Sua interface mantém os mesmos métodos previstos para um repositório de
    banco de dados futuro.
    """

    def __init__(self, videos: Sequence[Video] | None = None) -> None:
        self._videos = tuple(DEMO_VIDEOS if videos is None else videos)

    def list_videos(
        self,
        *,
        category: str | None = None,
        community_id: str | None = None,
        niche_ids: Sequence[str] = (),
    ) -> list[Video]:
        selected_niches = set(niche_ids)
        return [
            video
            for video in self._videos
            if (category is None or video.category.casefold() == category.strip().casefold())
            and (community_id is None or video.community_id == community_id.strip())
            and (not selected_niches or video.niche_id in selected_niches)
        ]

    def get_video(self, video_id: str) -> Video | None:
        return next((video for video in self._videos if video.id == video_id), None)


# Catálogo de demonstração alinhado aos dados existentes no frontend.
# Os assets seguem como caminhos do frontend; media_url fica vazio porque o
# projeto ainda não possui arquivos nem serviço de streaming de vídeo.
DEMO_VIDEOS = (
    Video(
        id="sports-1", title="Final do basquete masculino — Interusp 2026",
        category="sports", community_id="poli-usp", niche_id="basquete",
        author="BmPoliUsp", avatar="/src/assets/finds/avatars/bmpoliusp.png",
        image="/src/assets/finds/posts/sports-1.png",
        caption="Final do basquete masculino no interusp 2026, vitória da Poli contra",
        likes=1069, comment_count=100, posted_at="1 hour ago", duration=42,
    ),
    Video(
        id="sports-2", title="Treino intenso de judô", category="sports",
        community_id="judo-brasil", niche_id="treino", author="SoSoMariano",
        avatar="/src/assets/finds/avatars/sosomariano.png",
        image="/src/assets/finds/posts/sports-2.png",
        caption="Treino intenso de judô hoje!", likes=1069, comment_count=100,
        posted_at="1 hour ago", duration=28,
    ),
    Video(
        id="sports-3", title="Final do basquete masculino — Interusp 2025",
        category="sports", community_id="poli-usp", niche_id="basquete",
        author="BmPoliUsp", avatar="/src/assets/finds/avatars/bmpoliusp.png",
        image="/src/assets/finds/posts/sports-3.png",
        caption="Final do basquete masculino no interusp 2025, vitória da Poli contra",
        likes=1069, comment_count=100, posted_at="1 hour ago", duration=35,
    ),
    Video(
        id="cute-1", title="Aniversário da princesinha", category="cute",
        community_id="vida-de-pet", niche_id="festas", author="RafaelCarnauskas",
        avatar="/src/assets/finds/avatars/rafaelcarnauskas.png",
        image="/src/assets/finds/posts/cute-1.png",
        caption="Aniversário da minha princesinha", likes=1069, comment_count=100,
        posted_at="1 hour ago", duration=19,
    ),
    Video(
        id="cute-2", title="Aurora no descanso da tarde", category="cute",
        community_id="vida-de-pet", niche_id="rotina", author="mendesvictor",
        avatar="/src/assets/finds/avatars/mendesvictor.png",
        image="/src/assets/finds/posts/cute-2.png",
        caption="Aurora no seu descanso da tarde!", likes=1069, comment_count=100,
        posted_at="1 hour ago", duration=24,
    ),
    Video(
        id="cute-3", title="Dia de petshop", category="cute",
        community_id="vida-de-pet", niche_id="cuidados", author="MarcolinoCarlos",
        avatar="/src/assets/finds/avatars/marcolinocarlos.png",
        image="/src/assets/finds/posts/cute-3.png",
        caption="Dia de petshop", likes=1069, comment_count=100,
        posted_at="1 hour ago", duration=31,
    ),
    # Vídeos que antes existiam só no mock da Busca/Listas do front
    # (4-busca-listas/modelo/videoCatalog.js). Ainda não têm imagem nem avatar.
    # Comunidade e nicho são provisórios: as 3 comunidades atuais são as dos Finds.
    Video(
        id="curiosities-1", title="Por que os gatos sempre caem de pé", category="curiosities",
        community_id="vida-de-pet", niche_id="cuidados", author="curiouslab", avatar=None, image=None,
        caption="Por que os gatos sempre caem de pé", likes=0, comment_count=0, posted_at="1 day ago", duration=42,
    ),
    Video(
        id="tips-1", title="3 atalhos que todo dev deveria conhecer", category="tips",
        community_id="poli-usp", niche_id="vida-academica", author="codequick", avatar=None, image=None,
        caption="3 atalhos que todo dev deveria conhecer", likes=0, comment_count=0, posted_at="1 day ago", duration=58,
    ),
    Video(
        id="tips-2", title="Uma cozinha pequena com layout inteligente", category="tips",
        community_id="poli-usp", niche_id="vida-academica", author="smallspaces", avatar=None, image=None,
        caption="Uma cozinha pequena com layout inteligente", likes=0, comment_count=0, posted_at="1 day ago", duration=72,
    ),
    Video(
        id="curiosities-2", title="A ciência por trás do espresso perfeito", category="curiosities",
        community_id="poli-usp", niche_id="vida-academica", author="dailybrew", avatar=None, image=None,
        caption="A ciência por trás do espresso perfeito", likes=0, comment_count=0, posted_at="1 day ago", duration=51,
    ),
    Video(
        id="sports-4", title="Rotina de mobilidade em um minuto", category="sports",
        community_id="poli-usp", niche_id="atletismo", author="movebetter", avatar=None, image=None,
        caption="Rotina de mobilidade em um minuto", likes=0, comment_count=0, posted_at="1 day ago", duration=60,
    ),
    Video(
        id="humor-1", title="Quando seu cachorro tem outros planos", category="humor",
        community_id="vida-de-pet", niche_id="rotina", author="goodmood", avatar=None, image=None,
        caption="Quando seu cachorro tem outros planos", likes=0, comment_count=0, posted_at="1 day ago", duration=35,
    ),
    Video(
        id="cute-4", title="Um gatinho pequeno com uma personalidade enorme", category="cute",
        community_id="vida-de-pet", niche_id="rotina", author="littlepaws", avatar=None, image=None,
        caption="Um gatinho pequeno com uma personalidade enorme", likes=0, comment_count=0, posted_at="1 day ago", duration=28,
    ),
    Video(
        id="technology-1", title="Como uma impressora 3D constrói camada por camada", category="technology",
        community_id="poli-usp", niche_id="vida-academica", author="futurebits", avatar=None, image=None,
        caption="Como uma impressora 3D constrói camada por camada", likes=0, comment_count=0, posted_at="1 day ago", duration=84,
    ),
    Video(
        id="sports-5", title="Um aquecimento melhor antes da sua próxima corrida", category="sports",
        community_id="poli-usp", niche_id="atletismo", author="movebetter", avatar=None, image=None,
        caption="Um aquecimento melhor antes da sua próxima corrida", likes=0, comment_count=0, posted_at="1 day ago", duration=46,
    ),
)
