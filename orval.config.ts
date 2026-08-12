import { defineConfig } from 'orval'

export default defineConfig({
  reteniveBackend: {
    hooks: {
      afterAllFilesWrite: 'prettier --no-config --write',
    },
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
      prettier: false,
      override: {
        mutator: {
          path: './src/shared/api/http/orval-mutator.ts',
          name: 'request',
        },
      },
    },
  },
})
