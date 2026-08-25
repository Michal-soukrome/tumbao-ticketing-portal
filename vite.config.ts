import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && env.VITE_TEST_MODE === 'true') {
    throw new Error('VITE_TEST_MODE=true is forbidden in production builds.')
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __TEST_MODE_BUILD_ALLOWED__: JSON.stringify(mode !== 'production'),
    },
    server: { port: 5173 },
    preview: { port: 4173 },
  }
})
