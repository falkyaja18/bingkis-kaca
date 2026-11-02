import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' supaya hasil build jalan di /kiosk/ (server) maupun di dalam APK (Capacitor)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000', '/uploads': 'http://localhost:3000', '^/s(?:/|$)': 'http://localhost:3000' } }
})
