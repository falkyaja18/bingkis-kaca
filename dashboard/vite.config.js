import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Saat `npm run dev`, request API dan foto diteruskan ke server Express (port 3000)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000', '/s': 'http://localhost:3000', '/e': 'http://localhost:3000' } }
})
