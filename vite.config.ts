import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const dependenciesRoot = realpathSync(dirname(dirname(require.resolve('primeicons/package.json'))));

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 4173, fs: { allow: [workspaceRoot, dependenciesRoot] } },
});
