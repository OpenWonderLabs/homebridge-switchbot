import antfu from '@antfu/eslint-config'
import html from 'eslint-plugin-html'

export default antfu(
  {
    ignores: ['dist', 'docs'],
    jsx: false,
    typescript: true,
    formatters: {
      markdown: true,
      html: true,
    },
    plugins: {
      html,
    },
    rules: {
      'curly': ['error', 'multi-line'],
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-line-alignment': 'error',
      'perfectionist/sort-exports': 'error',
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            'type',
            ['builtin', 'external'],
            'internal',
            ['parent', 'sibling', 'index'],
            'unknown',
          ],
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-named-exports': 'error',
      'perfectionist/sort-named-imports': 'error',
      'sort-imports': 0,
      'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'style/quote-props': ['error', 'consistent-as-needed'],
      'test/no-only-tests': 'error',
      'unicorn/no-useless-spread': 'error',
      'unused-imports/no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-new': 0, // Disable the no-new rule
      'new-cap': 0, // Disable the new-cap rule
      'no-undef': 0, // Disable the no-undef rule
    },
  },
)
