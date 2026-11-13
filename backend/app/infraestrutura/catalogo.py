"""Conteúdo das tabelas ``servico``, ``permissao`` e ``assinatura``.

É a matriz de acesso e a tabela de mensagens do modelo de dados (seções 3 e 5).
:meth:`app.infraestrutura.dados.ServidorDadosCompartilhados.registrar_servicos`
grava este conteúdo no banco compartilhado ao subir a aplicação e no
``python -m app.db.migrar``; mudar a matriz é mudar este arquivo.
"""

from app.mensageria import (
    AUTENTICACAO,
    BUSCA_LISTAS,
    COMUNIDADE_ATUALIZADA,
    COMUNIDADE_CRIADA,
    COMUNIDADES,
    HISTORICO,
    INFRAESTRUTURA,
    MEMBRO_ENTROU,
    MEMBRO_SAIU,
    PERFIL_ATUALIZADO,
    REPRODUCAO_REGISTRADA,
    USUARIO_CADASTRADO,
    USUARIO_REMOVIDO,
    VIDEO_ATUALIZADO,
    VIDEO_PUBLICADO,
    VIDEO_REMOVIDO,
    VIDEOS,
)

SERVICOS = {
    AUTENTICACAO: "Autenticação",
    COMUNIDADES: "Comunidades",
    VIDEOS: "Vídeos",
    BUSCA_LISTAS: "Busca e Listas",
    HISTORICO: "Histórico",
    INFRAESTRUTURA: "Infraestrutura",
}

USUARIO_PUBLICO = "usuario_publico"
COMUNIDADE_PUBLICA = "comunidade_publica"
NICHO_PUBLICO = "nicho_publico"
VIDEO_PUBLICO = "video_publico"

# Tabela → (dono, leitores). O dono também lê.
MATRIZ_ACESSO = {
    USUARIO_PUBLICO: (AUTENTICACAO, (COMUNIDADES, VIDEOS, BUSCA_LISTAS, HISTORICO)),
    COMUNIDADE_PUBLICA: (COMUNIDADES, (VIDEOS, BUSCA_LISTAS)),
    NICHO_PUBLICO: (COMUNIDADES, (VIDEOS, BUSCA_LISTAS)),
    VIDEO_PUBLICO: (VIDEOS, (BUSCA_LISTAS, HISTORICO, COMUNIDADES)),
}


def permissoes() -> list[tuple[str, str, bool, bool]]:
    """Linhas de ``permissao``: (servico_id, tabela, pode_ler, pode_escrever)."""
    linhas = []
    for tabela, (dono, leitores) in MATRIZ_ACESSO.items():
        linhas.append((dono, tabela, True, True))
        linhas.extend((leitor, tabela, True, False) for leitor in leitores)
    return linhas


# Tipo de mensagem → assinantes (a infraestrutura recebe primeiro).
ASSINATURAS = {
    USUARIO_CADASTRADO: (INFRAESTRUTURA,),
    PERFIL_ATUALIZADO: (INFRAESTRUTURA,),
    USUARIO_REMOVIDO: (INFRAESTRUTURA, COMUNIDADES, VIDEOS, BUSCA_LISTAS, HISTORICO),
    COMUNIDADE_CRIADA: (INFRAESTRUTURA,),
    COMUNIDADE_ATUALIZADA: (INFRAESTRUTURA,),
    MEMBRO_ENTROU: (INFRAESTRUTURA,),
    MEMBRO_SAIU: (INFRAESTRUTURA,),
    VIDEO_PUBLICADO: (INFRAESTRUTURA, BUSCA_LISTAS),
    VIDEO_ATUALIZADO: (INFRAESTRUTURA, BUSCA_LISTAS),
    VIDEO_REMOVIDO: (INFRAESTRUTURA, BUSCA_LISTAS),
    REPRODUCAO_REGISTRADA: (HISTORICO,),
}

# Quem publica cada tipo. A infraestrutura recusa mensagem de outra origem.
PUBLICADORES = {
    USUARIO_CADASTRADO: AUTENTICACAO,
    PERFIL_ATUALIZADO: AUTENTICACAO,
    USUARIO_REMOVIDO: AUTENTICACAO,
    COMUNIDADE_CRIADA: COMUNIDADES,
    COMUNIDADE_ATUALIZADA: COMUNIDADES,
    MEMBRO_ENTROU: COMUNIDADES,
    MEMBRO_SAIU: COMUNIDADES,
    VIDEO_PUBLICADO: VIDEOS,
    VIDEO_ATUALIZADO: VIDEOS,
    VIDEO_REMOVIDO: VIDEOS,
    REPRODUCAO_REGISTRADA: VIDEOS,
}
