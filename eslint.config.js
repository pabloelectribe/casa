// El JS del cliente debe correr en Safari 9 (iOS 9.3.5): solo ES5.
module.exports = [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', XMLHttpRequest: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'fetch', message: 'Safari 9 no tiene fetch.' },
        { object: 'window', property: 'Intl', message: 'Safari 9 no tiene Intl.' },
      ],
      'no-restricted-globals': ['error', 'fetch', 'Intl', 'Promise', 'Symbol', 'Map', 'Set'],
    },
  },
];
