import { defineConfig } from 'orval'

export default defineConfig({
  reteniveBackend: {
    input: {
      target: './openapi/retenive-backend.json',
      override: {
        transformer: './scripts/filter-dangling-openapi-operations.mjs',
      },
    },
    output: {
      target: './src/shared/api/generated/retenive-backend.ts',
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
