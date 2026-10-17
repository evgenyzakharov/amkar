/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Относительные пути: сайт работает на GitHub Pages под любым именем репозитория
  base: './',
  plugins: [react()],
})
