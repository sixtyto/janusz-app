import type { Severity } from '#shared/types/severity'
import { ServiceType } from '#shared/types/ServiceType'
import { and, eq } from 'drizzle-orm'
import { minimatch } from 'minimatch'
import { repositorySettings } from '~~/server/database/schema'
import { useDatabase } from '~~/server/utils/useDatabase'
import { useLogger } from '~~/server/utils/useLogger'

const logger = useLogger(ServiceType.repositorySettings)

const SEVERITY_VALUES: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const
const THRESHOLD_VALUES = { low: 1, medium: 2, high: 3, critical: 4 } as const

export interface RepositorySettingsWithDefaults {
  enabled: boolean
  customPrompts: {
    replyPrompt?: string
    descriptionPrompt?: string
    contextSelectionPrompt?: string
  }
  severityThreshold: 'low' | 'medium' | 'high' | 'critical'
  excludedPatterns: string[]
  preferredModel: string
  agentExecutionMode: 'sequential' | 'parallel'
  verifyComments: boolean
}

const DEFAULT_SETTINGS: RepositorySettingsWithDefaults = {
  enabled: true,
  customPrompts: {},
  severityThreshold: 'medium',
  excludedPatterns: [],
  preferredModel: 'default',
  agentExecutionMode: 'parallel',
  verifyComments: true,
}

export async function getRepositorySettings(
  installationId: number,
  repositoryFullName: string,
): Promise<RepositorySettingsWithDefaults> {
  try {
    const database = useDatabase()
    const [settings] = await database
      .select()
      .from(repositorySettings)
      .where(
        and(
          eq(repositorySettings.installationId, installationId),
          eq(repositorySettings.repositoryFullName, repositoryFullName),
        ),
      )
      .limit(1)

    if (!settings) {
      return DEFAULT_SETTINGS
    }

    if (!settings.enabled) {
      return { ...DEFAULT_SETTINGS, enabled: false }
    }

    return {
      enabled: settings.enabled,
      customPrompts: settings.settings.customPrompts || {},
      severityThreshold: settings.settings.severityThreshold,
      excludedPatterns: settings.settings.excludedPatterns || [],
      preferredModel: settings.settings.preferredModel,
      agentExecutionMode: settings.settings.agentExecutionMode ?? 'parallel',
      verifyComments: settings.settings.verifyComments ?? true,
    }
  } catch (error) {
    logger.error('Failed to fetch repository settings', { error })
    return DEFAULT_SETTINGS
  }
}

export function shouldExcludeFile(filePath: string, excludedPatterns: string[]): boolean {
  if (excludedPatterns.length === 0) {
    return false
  }

  if (!filePath || filePath.startsWith('/') || filePath.startsWith('\\')) {
    return false
  }

  return excludedPatterns.some(pattern =>
    minimatch(filePath, pattern, { dot: true }),
  )
}

export function filterExcludedFiles(files: string[], excludedPatterns: string[]): string[] {
  return files.filter(file => !shouldExcludeFile(file, excludedPatterns))
}

export function meetsSeverityThreshold(
  severity: Severity,
  threshold: 'low' | 'medium' | 'high' | 'critical',
): boolean {
  return SEVERITY_VALUES[severity] >= THRESHOLD_VALUES[threshold]
}
