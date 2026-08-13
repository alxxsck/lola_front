import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import { withVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';

export default withVueTs(
  {
    ignores: ['dist/**', 'coverage/**', '.worktrees/**', 'src/shared/api/generated/**'],
  },
  js.configs.recommended,
  pluginVue.configs['flat/strongly-recommended'],
  vueTsConfigs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  skipFormatting,
);
