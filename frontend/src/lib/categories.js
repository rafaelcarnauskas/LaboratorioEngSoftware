// Identidade de categoria entre data/videoCatalog.js ('Sports') e data/reels.js ('sports').
// Consumido por pages/SearchView.jsx (chips) e por reelsIndex.selectReels (filtro).
//
// `name` é IDENTIFICADOR, não rótulo: é comparado com `videoCatalog[].category`,
// com `reels[].category` (via `categoryKey`) e com o parâmetro de URL legado
// `?tela=reels&categoria=sports`, que é contrato congelado da Suite_Selenium.
// Por isso `name` permanece em inglês. `label` é o texto em português que a UI
// exibe — use sempre `label` ao renderizar, nunca `name`.
const definitions = [
  { name: 'Humor', label: 'Humor', icon: '😄', tone: 'gold' },
  { name: 'Cute', label: 'Fofura', icon: '♥', tone: 'rose' },
  { name: 'Tips', label: 'Dicas', icon: '💡', tone: 'green' },
  { name: 'Technology', label: 'Tecnologia', icon: '▣', tone: 'blue' },
  { name: 'Sports', label: 'Esportes', icon: '⚽', tone: 'teal' },
  { name: 'Curiosities', label: 'Curiosidades', icon: '✣', tone: 'purple' },
]

const byKey = new Map(definitions.map((item) => [item.name.toLowerCase(), item]))

// 'sports', 'Sports' e ' SPORTS ' resolvem para a mesma Categoria_Canonica.
export function resolveCategory(rawName) {
  if (typeof rawName !== 'string') return null
  return byKey.get(rawName.trim().toLowerCase()) ?? null
}

export function categoryKey(rawName) {
  const resolved = resolveCategory(rawName)
  return resolved === null ? null : resolved.name.toLowerCase()
}

export { definitions as categoryDefinitions }
