import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Versión de UN SOLO ARCHIVO (index.html) que se puede abrir directo desde el dispositivo, sin servidor.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  publicDir: false,
  build: { outDir: 'dist-single', emptyOutDir: true },
})
