import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Os testes Selenium abrem http://localhost:5173. Se a porta estiver ocupada,
  // o Vite falha com erro claro em vez de subir em outra porta sem avisar.
  server: { port: 5173, strictPort: true },
  // Vitest: execução única (`npm run test` usa --run, nunca watch). O ambiente
  // jsdom atende tanto os módulos puros quanto os testes de renderização com
  // @testing-library/react.
  // Vitest 3 não aciona o transform de JSX do @vitejs/plugin-react sob o Vite 8:
  // sem isto, qualquer `.jsx` chega aos testes compilado no transform clássico
  // e quebra com `React is not defined`. No build normal o plugin continua
  // mandando, então a opção é inerte fora dos testes.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
    passWithNoTests: true,
  },
})
