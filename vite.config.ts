/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Относительные пути: сайт работает на GitHub Pages под любым именем репозитория
  base: './',
  plugins: [react()],
  // Свой порт: 5173 обычно занят SquashApp, а молча переехать на соседний Vite не должен — иначе браузер откроет чужой сайт
  server: {
    port: 5180,
    strictPort: true,
  },
})
