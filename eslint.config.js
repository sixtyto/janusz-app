import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    rules: {
      'curly': ['error', 'all'],
      'style/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      'vue/max-attributes-per-line': ['error', {
        singleline: {
          max: 1,
        },
        multiline: {
          max: 1,
        },
      }],
    },
  },
)
