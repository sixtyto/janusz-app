export const AI_MODELS = {
  OPENROUTER: [
    'upstage/solar-pro-3:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'mistralai/devstral-2512:free',
    'google/gemma-3-27b-it:free',
    'tngtech/tng-r1t-chimera:free',
  ] as const,
  GEMINI: [
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
  ] as const,
} as const

export type AIModel = typeof AI_MODELS.OPENROUTER[number] | typeof AI_MODELS.GEMINI[number] | 'default'

export interface ModelOption {
  label: string
  value: AIModel
}

export const MODEL_OPTIONS: ModelOption[] = [
  { label: 'Default (Auto-select)', value: 'default' },
  { label: 'Upstage Solar Pro 3 (OpenRouter)', value: 'upstage/solar-pro-3:free' },
  { label: 'Qwen 3 Next 80B (OpenRouter)', value: 'qwen/qwen3-next-80b-a3b-instruct:free' },
  { label: 'Gemini 3 Flash Preview (Direct)', value: 'gemini-3-flash-preview' },
  { label: 'Gemini 2.5 Flash (Direct)', value: 'gemini-2.5-flash' },
  { label: 'Gemma 3 27B (OpenRouter)', value: 'google/gemma-3-27b-it:free' },
  { label: 'Devstral 2512 (OpenRouter)', value: 'mistralai/devstral-2512:free' },
  { label: 'TNG R1T Chimera (OpenRouter)', value: 'tngtech/tng-r1t-chimera:free' },
]
