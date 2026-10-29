import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // cenote.html es la misma app con las metas de Cenote para el preview
      // del link compartido (ver el comentario en ese archivo).
      input: { main: 'index.html', cenote: 'cenote.html' },
    },
  },
})
