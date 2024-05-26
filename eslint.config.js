import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin'


export default tseslint.config({
  plugins: {
    '@stylistic': stylistic,
    '@typescript-eslint': tseslint.plugin,
  },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: true,
    },
  },
  files: ['**/*.ts'],
  ignores: ['.dist/*'],
  extends: [
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
  ],
  rules: {
    '@typescript-eslint/array-type': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@stylistic/type-annotation-spacing': 'error',
    '@stylistic/quotes': [
      'warn',
      'single',
    ],
    '@stylistic/indent': [
      'warn',
      2,
      {
        'SwitchCase': 1,
      },
    ],
    '@stylistic/linebreak-style': [
      'warn',
      'unix',
    ],
    '@stylistic/semi': [
      'warn',
      'always',
    ],
    '@stylistic/comma-dangle': [
      'warn',
      'always-multiline',
    ],
    '@stylistic/dot-notation': 'off',
    'eqeqeq': 'warn',
    'curly': [
      'warn',
      'all',
    ],
    '@stylistic/brace-style': [
      'warn',
    ],
    'prefer-arrow-callback': [
      'warn',
    ],
    '@stylistic/max-len': [
      'warn',
      150,
    ],
    'no-console': [
      'warn',
    ], // use the provided Homebridge log method instead
    'no-non-null-assertion': [
      'off',
    ],
    '@stylistic/comma-spacing': [
      'error',
    ],
    '@stylistic/no-multi-spaces': [
      'warn',
      {
        'ignoreEOLComments': true,
      },
    ],
    '@stylistic/no-trailing-spaces': [
      'warn',
    ],
    '@stylistic/lines-between-class-members': [
      'warn',
      'always',
      {
        'exceptAfterSingleLine': true,
      },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
});