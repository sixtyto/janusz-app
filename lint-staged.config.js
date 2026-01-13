export default {
  '*.{js,ts,vue}': [
    'eslint --fix',
    'npx vitest related --run --passWithNoTests',
  ],
  '*.{ts,vue}': () => 'npm run typecheck',
}
