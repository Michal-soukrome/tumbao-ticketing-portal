import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __TEST_MODE_BUILD_ALLOWED__: JSON.stringify(mode !== 'production'),
  },
  server: { port: 5173 },
  preview: { port: 4173 },
}))
