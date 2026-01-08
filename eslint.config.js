import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    typescript: {
      tsconfigPath: 'tsconfig.json',
      parserOptions: {
        projectService: {
          allowDefaultProject: ['./*.js', 'drizzle.config.ts'],
        },
      },
    },
    rules: {
      'ts/strict-boolean-expressions': 'off',
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
