import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App.jsx'
import { limparArmazenamentoLegado } from './1-autenticacao/modelo/session'
import './index.css' 

// Antes de montar o App (e de qualquer requisição): apaga o mock antigo de contas
// e sessões sem token, sem expiração ou expiradas (Requisito 12.7).
limparArmazenamentoLegado()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
