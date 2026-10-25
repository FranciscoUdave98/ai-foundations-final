import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app runs at http://127.0.0.1:5173 and proxies /api to the FastAPI backend on port 8000.
// Set VITE_API_TARGET to point somewhere else.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
