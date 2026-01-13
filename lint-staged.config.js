export default {
  '*.{js,ts,vue}': (files) => {
    return [
      `eslint --fix ${files.join(' ')}`,
      `npm test related ${files.join(' ')} -- --passWithNoTests`,
    ]
  },
  '*.{ts,vue}': () => 'npm run typecheck',
}
