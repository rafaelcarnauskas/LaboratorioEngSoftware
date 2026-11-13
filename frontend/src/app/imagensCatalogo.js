// Imagens do catálogo vindo da API.
//
// O backend guarda caminhos como `/src/assets/finds/posts/sports-1.png`, que só
// existem no servidor de desenvolvimento do Vite. Aqui cada caminho vira o
// asset importado de verdade (funciona também no build). Vídeo sem imagem e
// autor sem foto ganham um desenho gerado (SVG), para nenhuma tela mostrar
// imagem quebrada.
const assets = import.meta.glob('../assets/finds/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const assetsPorCaminho = new Map(
  Object.entries(assets).map(([caminho, url]) => [caminho.replace(/^\.\.\/assets\//, ''), url]),
)

const CORES = ['#e8b758', '#8cb9f0', '#8cc9ac', '#d4a27e', '#bea5e6', '#e4a0b4', '#7ccbc0']

function corPara(texto) {
  let soma = 0
  for (const letra of texto) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0
  return CORES[soma % CORES.length]
}

function escaparXml(texto) {
  return texto.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function svgParaUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// Caminho do backend → URL utilizável. URLs absolutas (http, data:) passam direto.
export function resolverImagem(caminho) {
  if (typeof caminho !== 'string' || caminho === '') return null
  const marcador = '/assets/'
  const posicao = caminho.indexOf(marcador)
  if (caminho.startsWith('/src/') && posicao >= 0) {
    return assetsPorCaminho.get(caminho.slice(posicao + marcador.length)) ?? null
  }
  return caminho
}

// Capa vertical com o título, para vídeo sem imagem.
export function capaGerada(titulo) {
  const cor = corPara(titulo)
  const texto = escaparXml(titulo.length > 60 ? `${titulo.slice(0, 57)}…` : titulo)
  return svgParaUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">` +
      `<rect width="540" height="960" fill="${cor}"/>` +
      `<rect width="540" height="960" fill="#000" opacity="0.18"/>` +
      `<foreignObject x="48" y="380" width="444" height="240">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="font:600 40px sans-serif;color:#fff;text-align:center">${texto}</div>` +
      `</foreignObject></svg>`,
  )
}

// Avatar redondo com a inicial, para autor sem foto.
export function avatarGerado(nome) {
  const inicial = escaparXml((nome.trim()[0] ?? '?').toUpperCase())
  return svgParaUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
      `<circle cx="32" cy="32" r="32" fill="${corPara(nome)}"/>` +
      `<text x="32" y="42" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="600" fill="#fff">${inicial}</text>` +
      `</svg>`,
  )
}
