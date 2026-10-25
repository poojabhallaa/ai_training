import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd()), ...process.env }
  return {
    // Set VITE_BASE_PATH when hosting under a sub-path, e.g. "/repo-name/" on GitHub Pages.
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      css: false,
    },
  }
})
