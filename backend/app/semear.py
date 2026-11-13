"""Dados de demonstração de todos os microserviços.

Uso, em ``backend/``, depois de ``python -m app.db.migrar``::

    python -m app.semear

Só roda com ``CHOOSEN_ENV=development``. Em ordem:

1. Autenticação: o usuário de demonstração e os autores dos vídeos
   (``app.autenticacao.semear``), publicados em ``usuario_publico``;
2. Comunidades: as três comunidades e seus nichos (ComunidadeCriada);
3. Vídeos: o catálogo de demonstração (VideoPublicado), que chega ao
   ``video_publico`` e ao ``indice_busca`` da Busca e Listas.

Cada serviço grava só no próprio banco; o resto chega por mensagem. Pode rodar
mais de uma vez: comunidades e vídeos existentes são atualizados, não duplicados.
"""

from __future__ import annotations

import sys
from datetime import timedelta
from typing import NamedTuple

from app.autenticacao import semear as semear_autenticacao
from app.core.config import carregar_configuracao
from app.core.relogio import agora_utc
from app.infraestrutura.catalogo import USUARIO_PUBLICO
from app.mensageria import VIDEOS
from app.plataforma import montar_plataforma

COMUNIDADES_DEMO = (
    ("poli-usp", "Poli USP", "Esportes e vida acadêmica da Escola Politécnica da USP.",
     (("basquete", "Basquete"), ("atletismo", "Atletismo"), ("vida-academica", "Vida acadêmica"))),
    ("judo-brasil", "Judô Brasil", "Treinos, campeonatos e técnica para judocas.",
     (("treino", "Treino"), ("competicao", "Competição"), ("tecnica", "Técnica"))),
    ("vida-de-pet", "Vida de Pet", "O dia a dia de quem divide a casa com um bichinho.",
     (("rotina", "Rotina"), ("festas", "Festas"), ("cuidados", "Cuidados"))),
)


class VideoDemo(NamedTuple):
    id: str
    autor: str
    comunidade_id: str
    nicho_id: str
    categoria: str
    titulo: str
    legenda: str
    duracao_segundos: int
    thumbnail_url: str | None
    recente: bool  # "1 hour ago" no catálogo antigo; os outros, "1 day ago"


# Mesmo catálogo que ficava em memória (MockVideoRepository), na mesma ordem.
VIDEOS_DEMO = (
    VideoDemo('sports-1', 'BmPoliUsp', 'poli-usp', 'basquete', 'sports',
              'Final do basquete masculino — Interusp 2026',
              'Final do basquete masculino no interusp 2026, vitória da Poli contra',
              42, '/src/assets/finds/posts/sports-1.png', True),
    VideoDemo('sports-2', 'SoSoMariano', 'judo-brasil', 'treino', 'sports',
              'Treino intenso de judô',
              'Treino intenso de judô hoje!',
              28, '/src/assets/finds/posts/sports-2.png', True),
    VideoDemo('sports-3', 'BmPoliUsp', 'poli-usp', 'basquete', 'sports',
              'Final do basquete masculino — Interusp 2025',
              'Final do basquete masculino no interusp 2025, vitória da Poli contra',
              35, '/src/assets/finds/posts/sports-3.png', True),
    VideoDemo('cute-1', 'RafaelCarnauskas', 'vida-de-pet', 'festas', 'cute',
              'Aniversário da princesinha',
              'Aniversário da minha princesinha',
              19, '/src/assets/finds/posts/cute-1.png', True),
    VideoDemo('cute-2', 'mendesvictor', 'vida-de-pet', 'rotina', 'cute',
              'Aurora no descanso da tarde',
              'Aurora no seu descanso da tarde!',
              24, '/src/assets/finds/posts/cute-2.png', True),
    VideoDemo('cute-3', 'MarcolinoCarlos', 'vida-de-pet', 'cuidados', 'cute',
              'Dia de petshop',
              'Dia de petshop',
              31, '/src/assets/finds/posts/cute-3.png', True),
    VideoDemo('curiosities-1', 'curiouslab', 'vida-de-pet', 'cuidados', 'curiosities',
              'Por que os gatos sempre caem de pé',
              'Por que os gatos sempre caem de pé',
              42, None, False),
    VideoDemo('tips-1', 'codequick', 'poli-usp', 'vida-academica', 'tips',
              '3 atalhos que todo dev deveria conhecer',
              '3 atalhos que todo dev deveria conhecer',
              58, None, False),
    VideoDemo('tips-2', 'smallspaces', 'poli-usp', 'vida-academica', 'tips',
              'Uma cozinha pequena com layout inteligente',
              'Uma cozinha pequena com layout inteligente',
              72, None, False),
    VideoDemo('curiosities-2', 'dailybrew', 'poli-usp', 'vida-academica', 'curiosities',
              'A ciência por trás do espresso perfeito',
              'A ciência por trás do espresso perfeito',
              51, None, False),
    VideoDemo('sports-4', 'movebetter', 'poli-usp', 'atletismo', 'sports',
              'Rotina de mobilidade em um minuto',
              'Rotina de mobilidade em um minuto',
              60, None, False),
    VideoDemo('humor-1', 'goodmood', 'vida-de-pet', 'rotina', 'humor',
              'Quando seu cachorro tem outros planos',
              'Quando seu cachorro tem outros planos',
              35, None, False),
    VideoDemo('cute-4', 'littlepaws', 'vida-de-pet', 'rotina', 'cute',
              'Um gatinho pequeno com uma personalidade enorme',
              'Um gatinho pequeno com uma personalidade enorme',
              28, None, False),
    VideoDemo('technology-1', 'futurebits', 'poli-usp', 'vida-academica', 'technology',
              'Como uma impressora 3D constrói camada por camada',
              'Como uma impressora 3D constrói camada por camada',
              84, None, False),
    VideoDemo('sports-5', 'movebetter', 'poli-usp', 'atletismo', 'sports',
              'Um aquecimento melhor antes da sua próxima corrida',
              'Um aquecimento melhor antes da sua próxima corrida',
              46, None, False),
)


def _erro(mensagem: str) -> int:
    print(mensagem, file=sys.stderr)
    return 1


def main() -> int:
    codigo = semear_autenticacao.main()
    if codigo != 0:
        return codigo

    config = carregar_configuracao()
    plataforma = montar_plataforma(config)
    try:
        for comunidade_id, nome, descricao, nichos in COMUNIDADES_DEMO:
            plataforma.comunidades.salvar_comunidade(comunidade_id, nome, descricao, list(nichos))
        print(f"{len(COMUNIDADES_DEMO)} comunidades de demonstração gravadas.")

        usernames = sorted({v.autor for v in VIDEOS_DEMO})
        perfis = plataforma.clientes[VIDEOS].listar(USUARIO_PUBLICO, username=usernames)
        autores = {p["username"]: p["usuario_id"] for p in perfis}
        faltando = [u for u in usernames if u not in autores]
        if faltando:
            return _erro("Autores sem usuario_publico: " + ", ".join(faltando)
                         + ". Confira os avisos de choosen.mensagens.")

        agora = agora_utc()
        for posicao, v in enumerate(VIDEOS_DEMO):
            # A ordem do catálogo vira a ordem de publicação (mais recente primeiro).
            idade = timedelta(hours=1) if v.recente else timedelta(days=1)
            plataforma.videos.salvar_video(
                video_id=v.id, autor_id=autores[v.autor], comunidade_id=v.comunidade_id,
                nicho_id=v.nicho_id, titulo=v.titulo, legenda=v.legenda, categoria=v.categoria,
                duracao_segundos=v.duracao_segundos, thumbnail_url=v.thumbnail_url,
                publicado_em=agora - idade - timedelta(seconds=posicao),
            )
        print(f"{len(VIDEOS_DEMO)} vídeos de demonstração publicados.")
        return 0
    finally:
        plataforma.fechar()


if __name__ == "__main__":
    sys.exit(main())
