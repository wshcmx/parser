import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'coverage/**']),
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { '@stylistic': stylistic },
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@stylistic/object-curly-newline': ['error', {
        TSInterfaceBody: 'always',
        ObjectExpression: { multiline: true, minProperties: 2, consistent: true },
      }],
      '@stylistic/object-property-newline': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      curly: ['error', 'all'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/indent': ['error', 2],
      '@stylistic/padding-line-between-statements': ['error',
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while'] },
        { blankLine: 'always', prev: ['if', 'for', 'while'], next: '*' },
      ],
    },
  },
  {
    files: ['src/ast.ts'],
    rules: {
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'semi', requireLast: true },
      }],
    },
  },
);