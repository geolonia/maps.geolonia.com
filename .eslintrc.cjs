module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:editorconfig/all',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'editorconfig', 'import'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  env: {
    browser: true,
    es6: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'array-callback-return': 'error',
    'arrow-parens': 'error',
    'arrow-spacing': 'error',
    'block-spacing': 'warn',
    'comma-dangle': ['error', 'always-multiline'],
    'comma-spacing': ['warn', { before: false, after: true }],
    'key-spacing': 'error',
    'keyword-spacing': 'warn',
    'generator-star-spacing': 'error',
    'no-console': 'warn',
    'no-duplicate-imports': 'error',
    'no-useless-computed-key': 'error',
    'no-useless-constructor': 'error',
    'no-useless-rename': 'error',
    'no-var': 'error',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'prefer-arrow-callback': 'error',
    'prefer-const': 'error',
    'prefer-rest-params': 'error',
    'prefer-spread': 'error',
    'prefer-template': 'error',
    quotes: ['error', 'single'],
    'rest-spread-spacing': 'error',
    semi: ['error', 'always'],
    'semi-spacing': 'error',
    'sort-imports': 'off',
    'space-before-blocks': 'error',
    'template-curly-spacing': 'error',
    'yield-star-spacing': 'error',
    yoda: ['error', 'never', { exceptRange: true }],
    'import/no-extraneous-dependencies': ['warn', { devDependencies: false }],
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
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
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
      rules: {
        'no-import-assign': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
