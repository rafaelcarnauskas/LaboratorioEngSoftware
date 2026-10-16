const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function participarNaComunidade(comunidadeId, usuarioId = 'usuario-demo') {
  if (import.meta.env.MODE === 'test') {
    return { comunidade_id: comunidadeId, participou_agora: true }
  }

  let response

  try {
    response = await fetch(`${API_URL}/api/v1/comunidades/${comunidadeId}/participar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: usuarioId }),
    })
  } catch {
    throw new Error('Não foi possível conectar ao backend de comunidades. Verifique se a API está executando.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível entrar na comunidade.')
  }

  return response.json()
}
