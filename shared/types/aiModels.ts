export const AI_MODELS = {
  ZHIPU_GLM: [
    'glm-4.7-flash',
    'glm-4.5-flash',
  ] as const,
  OPENROUTER: [
    'arcee-ai/trinity-large-preview:free',
    'upstage/solar-pro-3:free',
    'tngtech/tng-r1t-chimera:free',
  ] as const,
  GEMINI: [
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
  ] as const,
} as const

export type AIModel = typeof AI_MODELS.ZHIPU_GLM[number] | typeof AI_MODELS.OPENROUTER[number] | typeof AI_MODELS.GEMINI[number] | 'default'

export interface ModelOption {
  label: string
  value: AIModel
}

export const MODEL_OPTIONS: ModelOption[] = [
  { label: 'Default (Auto-select)', value: 'default' },
  { label: 'GLM-4.7-Flash Free (Zhipu Z.AI)', value: 'glm-4.7-flash' },
  { label: 'GLM-4.5-Flash Free (Zhipu Z.AI)', value: 'glm-4.5-flash' },
  { label: 'Upstage Solar Pro 3 (OpenRouter)', value: 'upstage/solar-pro-3:free' },
  { label: 'Gemini 3 Flash Preview (Direct)', value: 'gemini-3-flash-preview' },
  { label: 'Gemini 2.5 Flash (Direct)', value: 'gemini-2.5-flash' },
  { label: 'TNG R1T Chimera (OpenRouter)', value: 'tngtech/tng-r1t-chimera:free' },
  { label: 'Arcee AI Trinity Large Preview (OpenRouter)', value: 'arcee-ai/trinity-large-preview:free' },
]
