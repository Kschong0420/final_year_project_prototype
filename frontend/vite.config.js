import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.CLASSROOM_API_TARGET || 'http://127.0.0.1:8000'
const frontendPort = Number(process.env.CLASSROOM_FRONTEND_PORT || 5173)
const proxy = {
  '/api': { target: backend },
  '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
}
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: frontendPort, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
})
