import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactPkg from 'react/package.json' with { type: 'json' };

export default defineConfig(
  {
    ignores: ['build/', 'node_modules/'],
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'e2e/**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
    ],
    plugins: {
      '@stylistic': stylistic,
      'import-x': importX,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    settings: {
      react: {
        // eslint-plugin-react の 'detect' は ESLint 10 で削除された API を使うので、版を明示する
        version: reactPkg.version,
      },
    },
    rules: {
      // eslint-plugin-react-hooks v5 の recommended と同じ 2 ルールだけを有効にする
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // .editorconfig の内容を、整形のルールとして強制する
      '@stylistic/indent': ['error', 2],
      '@stylistic/linebreak-style': ['error', 'unix'],
      '@stylistic/eol-last': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      'unicode-bom': ['error', 'never'],

      'array-callback-return': 'error',
      '@stylistic/arrow-parens': 'error',
      '@stylistic/arrow-spacing': 'error',
      '@stylistic/block-spacing': 'warn',
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': ['warn', { before: false, after: true }],
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'warn',
      '@stylistic/generator-star-spacing': 'error',
      'no-console': 'warn',
      'no-duplicate-imports': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-rename': 'error',
      'no-var': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/rest-spread-spacing': 'error',
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/semi-spacing': 'error',
      'sort-imports': 'off',
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/template-curly-spacing': 'error',
      '@stylistic/yield-star-spacing': 'error',
      yoda: ['error', 'never', { exceptRange: true }],
      'import-x/no-extraneous-dependencies': ['warn', { devDependencies: false }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'react/prop-types': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    rules: {
      'no-import-assign': 'off',
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
);
