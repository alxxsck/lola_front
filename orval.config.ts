import { defineConfig } from 'orval'

export default defineConfig({
  lolaBackend: {
    input: {
      target: './openapi/lola-backend.json',
    },
    output: {
      target: './src/shared/api/generated/lola-backend.ts',
      schemas: './src/shared/api/generated/models',
      client: 'axios-functions',
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: './src/shared/api/http/orval-mutator.ts',
          name: 'request',
        },
      },
    },
  },
})
