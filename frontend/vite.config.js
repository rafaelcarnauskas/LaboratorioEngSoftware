import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Os testes Selenium abrem http://localhost:5173. Se a porta estiver ocupada,
  // o Vite falha com erro claro em vez de subir em outra porta sem avisar.
  server: { port: 5173, strictPort: true },
})
