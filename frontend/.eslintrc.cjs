module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    'no-empty': ['error', { allowEmptyCatch: true }],
    'react/react-in-jsx-scope': 'off',
    'react/no-unescaped-entities': 'off'
  },
  overrides: [{ files: ['*.config.js', '*.config.cjs', '.eslintrc.cjs'], env: { node: true } }]
};
