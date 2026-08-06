import { realpathSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url))
const dependenciesRoot = realpathSync(
  fileURLToPath(new URL('./node_modules', import.meta.url)),
)

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 4173, fs: { allow: [workspaceRoot, dependenciesRoot] } },
})
