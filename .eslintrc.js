module.exports = {
  extends: [
    '@geolonia',
    'react-app',
    'plugin:react/recommended',
  ],
  env: {
    browser: true,
    jest: true,
  },
  settings: {
    react: {
      pragma: 'React',
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['**/*.tsx'],
      rules: {
        'react/prop-types': 'off',
      },
    },
  ],
};
