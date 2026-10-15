/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // public/assets holds tens of thousands of exported files; watching them stalls the dev
    // server on Windows. Re-run the asset export and reload instead.
    watch: { ignored: ['**/public/assets/**'] },
    proxy: {
      '/api': `http://127.0.0.1:${process.env.API_PORT ?? 3000}`,
      '/socket.io': { target: `http://127.0.0.1:${process.env.API_PORT ?? 3000}`, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
