import { Octokit } from 'octokit'
import { z } from 'zod'
import { repositorySettings } from '~~/server/database/schema'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { useDatabase } from '~~/server/utils/useDatabase'

const paramsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
})

const settingsBodySchema = z.object({
  enabled: z.boolean().default(true),
  settings: z.object({
    customPrompts: z.object({
      replyPrompt: z.string().max(10000).optional(),
      descriptionPrompt: z.string().max(10000).optional(),
      contextSelectionPrompt: z.string().max(10000).optional(),
    }).optional().default({}),
    severityThreshold: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    excludedPatterns: z.array(z.string().max(500)).max(50).default([]),
    preferredModel: z.string().max(100).default('default'),
    agentExecutionMode: z.enum(['sequential', 'parallel']).default('sequential'),
  }).default({
    customPrompts: {},
    severityThreshold: 'medium',
    excludedPatterns: [],
    preferredModel: 'default',
    agentExecutionMode: 'sequential',
  }),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const githubToken = session.secure?.githubToken

  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const params = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, settingsBodySchema.parse)

  const repositoryFullName = `${params.owner}/${params.repo}`

  const octokit = new Octokit({ auth: githubToken })

  let installationId: number | undefined
  let repositoryExists = false

  try {
    const config = useRuntimeConfig()
    const { data: installationsData } = await octokit.rest.apps.listInstallationsForAuthenticatedUser()
    const targetInstallations = config.githubAppId
      ? installationsData.installations.filter(i => i.app_id === Number.parseInt(config.githubAppId))
      : installationsData.installations

    for (const installation of targetInstallations) {
      const { data } = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
        installation_id: installation.id,
      })

      const repository = data.repositories.find(repo => repo.full_name === repositoryFullName)
      if (repository) {
        installationId = installation.id
        repositoryExists = true
        break
      }
    }
  } catch {
    throw createError({
      status: 502,
      message: 'Failed to communicate with GitHub API',
    })
  }

  if (!repositoryExists || !installationId) {
    throw createError({ status: 404, message: 'Repository not found or no access' })
  }

  // Verify user has access
  const userInstallationIds = await getUserInstallationIds(githubToken)
  if (!userInstallationIds.has(installationId)) {
    throw createError({ status: 403, message: 'You do not have access to this repository' })
  }

  const database = useDatabase()

  // Normalize empty custom prompts on server-side
  const normalizedCustomPrompts: Record<string, string> = {}
  for (const [key, value] of Object.entries(body.settings.customPrompts)) {
    if (value?.trim()) {
      normalizedCustomPrompts[key] = value.trim()
    }
  }

  const normalizedSettings = {
    ...body.settings,
    customPrompts: normalizedCustomPrompts,
  }

  const result = await database
    .insert(repositorySettings)
    .values({
      installationId,
      repositoryFullName,
      enabled: body.enabled,
      settings: normalizedSettings,
    })
    .onConflictDoUpdate({
      target: [repositorySettings.installationId, repositorySettings.repositoryFullName],
      set: {
        enabled: body.enabled,
        settings: normalizedSettings,
        updatedAt: new Date(),
      },
    })
    .returning()

  return result[0]!
})
