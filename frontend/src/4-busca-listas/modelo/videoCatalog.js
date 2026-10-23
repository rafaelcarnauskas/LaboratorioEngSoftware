// Catálogo local de Busca e Listas. A fonte dos vídeos é o Serviço de Vídeos do
// back (parte 3, mesmos ids); este arquivo é a cópia usada nos testes e quando a
// API está fora do ar, e guarda a apresentação (ícone e cor) de cada vídeo.
// `category` permanece em inglês: é identificador resolvido por categories.js.
// `creator` são @handles e também ficam como estão.
export const videoCatalog = [
  { id: 'curiosities-1', title: 'Por que os gatos sempre caem de pé', creator: '@curiouslab', category: 'Curiosities', duration: '0:42', thumbnailClass: 'history-thumb--amber', artwork: 'orbit', color: '#e8b758' },
  { id: 'tips-1', title: '3 atalhos que todo dev deveria conhecer', creator: '@codequick', category: 'Tips', duration: '0:58', thumbnailClass: 'history-thumb--blue', artwork: 'code', color: '#8cb9f0' },
  { id: 'tips-2', title: 'Uma cozinha pequena com layout inteligente', creator: '@smallspaces', category: 'Tips', duration: '1:12', thumbnailClass: 'history-thumb--green', artwork: 'home', color: '#8cc9ac' },
  { id: 'curiosities-2', title: 'A ciência por trás do espresso perfeito', creator: '@dailybrew', category: 'Curiosities', duration: '0:51', thumbnailClass: 'history-thumb--brown', artwork: 'coffee', color: '#d4a27e' },
  { id: 'sports-4', title: 'Rotina de mobilidade em um minuto', creator: '@movebetter', category: 'Sports', duration: '1:00', thumbnailClass: 'history-thumb--purple', artwork: 'sun', color: '#bea5e6' },
  { id: 'humor-1', title: 'Quando seu cachorro tem outros planos', creator: '@goodmood', category: 'Humor', duration: '0:35', thumbnailClass: 'history-thumb--amber', artwork: 'smile', color: '#e8b758' },
  { id: 'cute-4', title: 'Um gatinho pequeno com uma personalidade enorme', creator: '@littlepaws', category: 'Cute', duration: '0:28', thumbnailClass: 'history-thumb--purple', artwork: 'heart', color: '#e4a0b4' },
  { id: 'technology-1', title: 'Como uma impressora 3D constrói camada por camada', creator: '@futurebits', category: 'Technology', duration: '1:24', thumbnailClass: 'history-thumb--blue', artwork: 'layers', color: '#8cb9f0' },
  { id: 'sports-5', title: 'Um aquecimento melhor antes da sua próxima corrida', creator: '@movebetter', category: 'Sports', duration: '0:46', thumbnailClass: 'history-thumb--green', artwork: 'activity', color: '#7ccbc0' },
]

// Ids numéricos usados antes de o catálogo vir do back: listas antigas salvas no
// navegador são convertidas ao carregar.
export const legacyVideoIds = {
  1: 'curiosities-1', 2: 'tips-1', 3: 'tips-2', 4: 'curiosities-2', 5: 'sports-4',
  6: 'humor-1', 7: 'cute-4', 8: 'technology-1', 9: 'sports-5',
}

const byId = new Map(videoCatalog.map((video) => [video.id, video]))

// Apresentação padrão por categoria, para vídeos do back sem entrada local (ex.: Finds).
const fallbackByCategory = {
  sports: { thumbnailClass: 'history-thumb--green', artwork: 'activity', color: '#7ccbc0' },
  cute: { thumbnailClass: 'history-thumb--purple', artwork: 'heart', color: '#e4a0b4' },
  humor: { thumbnailClass: 'history-thumb--amber', artwork: 'smile', color: '#e8b758' },
  tips: { thumbnailClass: 'history-thumb--green', artwork: 'home', color: '#8cc9ac' },
  technology: { thumbnailClass: 'history-thumb--blue', artwork: 'layers', color: '#8cb9f0' },
  curiosities: { thumbnailClass: 'history-thumb--amber', artwork: 'orbit', color: '#e8b758' },
}

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--'
  const seconds = Math.round(totalSeconds)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Converte um vídeo da API de Busca (backend/app/busca_listas) para o formato das telas.
export function presentVideo(apiVideo) {
  const local = byId.get(apiVideo.id)
  const visual = local ?? fallbackByCategory[String(apiVideo.category).toLowerCase()] ?? fallbackByCategory.curiosities
  const creator = String(apiVideo.creator ?? '')
  return {
    id: apiVideo.id,
    title: apiVideo.title,
    creator: creator.startsWith('@') ? creator : `@${creator}`,
    // mantém o identificador de categoria do catálogo local ('Sports'); o back usa minúsculas
    category: local?.category ?? apiVideo.category,
    duration: formatDuration(apiVideo.durationSeconds),
    thumbnailClass: visual.thumbnailClass,
    artwork: visual.artwork,
    color: visual.color,
  }
}
