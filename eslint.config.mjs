import obsidian from 'eslint-plugin-obsidianmd';

export default [
  {
    ignores: ['main.js', 'node_modules/**'],
  },
  ...obsidian.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];
