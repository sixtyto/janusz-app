<script setup lang="ts">
import type { AIModel } from '#shared/types/aiModels'
import { MODEL_OPTIONS } from '#shared/types/aiModels'

const route = useRoute()
const toast = useToast()

const owner = computed(() => route.params.owner as string)
const repo = computed(() => route.params.repo as string)
const repositoryFullName = computed(() => `${owner.value}/${repo.value}`)

const isLoading = ref(true)
const isSaving = ref(false)
const hasChanges = ref(false)

const form = ref({
  enabled: true,
  settings: {
    customPrompts: {
      replyPrompt: '',
      descriptionPrompt: '',
      contextSelectionPrompt: '',
    },
    severityThreshold: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    excludedPatterns: [] as string[],
    preferredModel: 'default' as AIModel,
    agentExecutionMode: 'sequential' as 'sequential' | 'parallel',
    verifyComments: true,
  },
})

const excludedPatternsInput = ref('')

const severityOptions: { label: string, value: 'low' | 'medium' | 'high' | 'critical' }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
]

const { data: currentSettings, refresh, error } = await useFetch(
  `/api/repositories/${owner.value}/${repo.value}/settings`,
)

watch(currentSettings, (settings) => {
  if (settings) {
    form.value = {
      enabled: settings.enabled,
      settings: {
        customPrompts: {
          replyPrompt: settings.settings.customPrompts.replyPrompt ?? '',
          descriptionPrompt: settings.settings.customPrompts.descriptionPrompt ?? '',
          contextSelectionPrompt: settings.settings.customPrompts.contextSelectionPrompt ?? '',
        },
        severityThreshold: settings.settings.severityThreshold,
        excludedPatterns: [...settings.settings.excludedPatterns],
        preferredModel: settings.settings.preferredModel as AIModel,
        agentExecutionMode: settings.settings.agentExecutionMode ?? 'sequential',
        verifyComments: settings.settings.verifyComments ?? true,
      },
    }
    excludedPatternsInput.value = settings.settings.excludedPatterns.join('\n')
  }
  isLoading.value = false
}, { immediate: true })

watch(form, () => {
  hasChanges.value = true
}, { deep: true })

watch(excludedPatternsInput, (value) => {
  form.value.settings.excludedPatterns = value
    .split('\n')
    .map(pattern => pattern.trim())
    .filter(Boolean)
})

async function saveSettings() {
  isSaving.value = true

  try {
    const normalizedCustomPrompts: Record<string, string> = {}
    for (const [key, value] of Object.entries(form.value.settings.customPrompts)) {
      if (value && value.trim().length > 0) {
        normalizedCustomPrompts[key] = value
      }
    }

    const bodyToSave = {
      enabled: form.value.enabled,
      settings: {
        ...form.value.settings,
        customPrompts: normalizedCustomPrompts,
      },
    }

    await useCsrfFetch(`/api/repositories/${owner.value}/${repo.value}/settings`, {
      method: 'PUT',
      body: bodyToSave,
    })

    toast.add({
      title: 'Settings saved',
      description: 'Repository settings have been updated successfully.',
      color: 'success',
    })

    hasChanges.value = false
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Failed to save settings',
      description: err.data?.message || err.message,
      color: 'error',
    })
  } finally {
    isSaving.value = false
  }
}

async function resetToDefaults() {
  form.value = {
    enabled: true,
    settings: {
      customPrompts: {
        replyPrompt: '',
        descriptionPrompt: '',
        contextSelectionPrompt: '',
      },
      severityThreshold: 'medium',
      excludedPatterns: [],
      preferredModel: 'default',
      agentExecutionMode: 'sequential',
      verifyComments: true,
    },
  }
  excludedPatternsInput.value = ''
  hasChanges.value = true
}

definePageMeta({
  title: 'Repository Settings',
  middleware: ['auth'],
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            to="/repositories"
          />
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ repositoryFullName }}
          </h1>
        </div>
        <p class="text-gray-500 dark:text-gray-400">
          Configure review behavior and custom prompts
        </p>
      </div>

      <div class="flex gap-2">
        <UButton
          label="Reset to Defaults"
          color="neutral"
          variant="outline"
          :disabled="isSaving || isLoading"
          @click="resetToDefaults"
        />
        <UButton
          label="Save Settings"
          color="primary"
          :loading="isSaving"
          :disabled="!hasChanges || isLoading"
          @click="saveSettings"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      title="Error loading settings"
      :description="error.message"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-triangle"
    />

    <div
      v-if="isLoading"
      class="space-y-6"
    >
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-40 w-full" />
      <USkeleton class="h-32 w-full" />
    </div>

    <div
      v-else
      class="space-y-6"
    >
      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            Review Status
          </h3>
        </template>

        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">
              Enable Automated Reviews
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              When disabled, Janusz will not review pull requests for this repository
            </p>
          </div>
          <USwitch
            v-model="form.enabled"
            color="primary"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            Severity Threshold
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Minimum severity level for reporting issues. Issues below this threshold will be ignored.
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <UButton
              v-for="option in severityOptions"
              :key="option.value"
              :label="option.label"
              :color="form.settings.severityThreshold === option.value ? 'primary' : 'neutral'"
              :variant="form.settings.severityThreshold === option.value ? 'solid' : 'outline'"
              @click="form.settings.severityThreshold = option.value"
            />
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            AI Model
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Select the preferred AI model for code reviews. "Default" will automatically select the best available model.
          </p>

          <USelect
            v-model="form.settings.preferredModel"
            :items="MODEL_OPTIONS"
            value-attribute="value"
            placeholder="Select AI model"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            Agent Execution Mode
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Choose how AI agents analyze your pull requests. Sequential mode is slower but avoids API rate limits. Parallel mode is faster but may trigger rate limiting.
          </p>

          <div class="grid grid-cols-2 gap-2">
            <UButton
              label="Sequential"
              :color="form.settings.agentExecutionMode === 'sequential' ? 'primary' : 'neutral'"
              :variant="form.settings.agentExecutionMode === 'sequential' ? 'solid' : 'outline'"
              @click="form.settings.agentExecutionMode = 'sequential'"
            >
              <template #trailing>
                <span class="text-xs opacity-70">(default, avoids 429)</span>
              </template>
            </UButton>

            <UButton
              label="Parallel"
              :color="form.settings.agentExecutionMode === 'parallel' ? 'primary' : 'neutral'"
              :variant="form.settings.agentExecutionMode === 'parallel' ? 'solid' : 'outline'"
              @click="form.settings.agentExecutionMode = 'parallel'"
            >
              <template #trailing>
                <span class="text-xs opacity-70">(faster, rate-limited)</span>
              </template>
            </UButton>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            Comment Verification
          </h3>
        </template>

        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">
              Verify Comments Before Posting
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Runs an extra model to verify each comment above your severity threshold. Disable to save tokens.
            </p>
          </div>
          <USwitch
            v-model="form.settings.verifyComments"
            color="primary"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            Excluded Patterns
          </h3>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Enter file patterns to exclude from reviews (one per line). Supports glob patterns like <code>*.test.ts</code> or <code>dist/**</code>
          </p>

          <UTextarea
            v-model="excludedPatternsInput"
            :rows="6"
            placeholder="*.test.ts&#10;*.spec.ts&#10;dist/**&#10;node_modules/**&#10;*.generated.ts"
          />

          <div
            v-if="form.settings.excludedPatterns.length > 0"
            class="flex flex-wrap gap-2"
          >
            <span
              v-for="pattern in form.settings.excludedPatterns"
              :key="pattern"
              class="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded"
            >
              {{ pattern }}
            </span>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-medium">
            Custom Prompts
          </h3>
        </template>

        <div class="space-y-6">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Override default prompts to customize review behavior for this repository. Leave empty to use defaults. Max 10,000 characters per prompt.
          </p>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reply System Prompt
            </label>
            <UTextarea
              v-model="form.settings.customPrompts.replyPrompt"
              :rows="6"
              placeholder="Customize how Janusz responds to comment replies..."
              :maxlength="10000"
            />
            <p class="text-xs text-gray-500">
              This prompt controls how the AI responds to developer replies
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              PR Description Prompt
            </label>
            <UTextarea
              v-model="form.settings.customPrompts.descriptionPrompt"
              :rows="6"
              placeholder="Customize how Janusz generates PR descriptions..."
              :maxlength="10000"
            />
            <p class="text-xs text-gray-500">
              This prompt controls how the AI generates pull request descriptions
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Context Selection Prompt
            </label>
            <UTextarea
              v-model="form.settings.customPrompts.contextSelectionPrompt"
              :rows="6"
              placeholder="Customize how Janusz selects relevant files for context..."
              :maxlength="10000"
            />
            <p class="text-xs text-gray-500">
              This prompt controls how the AI chooses which files to include in analysis
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
