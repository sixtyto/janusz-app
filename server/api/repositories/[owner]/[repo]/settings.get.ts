import { and, eq } from 'drizzle-orm'
import { Octokit } from 'octokit'
import { z } from 'zod'
import { repositorySettings } from '~~/server/database/schema'
import { getUserInstallationIds } from '~~/server/utils/getUserInstallationIds'
import { useDatabase } from '~~/server/utils/useDatabase'

const paramsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const githubToken = session.secure?.githubToken

  if (!githubToken) {
    throw createError({ status: 401, message: 'Missing GitHub token' })
  }

  const params = await getValidatedRouterParams(event, paramsSchema.parse)
  const repositoryFullName = `${params.owner}/${params.repo}`

  const octokit = new Octokit({ auth: githubToken })

  let installationId: number | undefined

  try {
    const { data: installationsData } = await octokit.rest.apps.listInstallationsForAuthenticatedUser()
    const config = useRuntimeConfig()

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
        break
      }
    }
  } catch {
    throw createError({
      status: 502,
      message: 'Failed to communicate with GitHub API',
    })
  }

  if (!installationId) {
    throw createError({ status: 404, message: 'Repository not found or no access' })
  }

  // Verify user has access to this repository's installation BEFORE querying database
  const userInstallationIds = await getUserInstallationIds(githubToken)
  if (!userInstallationIds.has(installationId)) {
    throw createError({ status: 403, message: 'You do not have access to this repository' })
  }

  const database = useDatabase()

  const settings = await database
    .select()
    .from(repositorySettings)
    .where(
      and(
        eq(repositorySettings.installationId, installationId),
        eq(repositorySettings.repositoryFullName, repositoryFullName),
      ),
    )
    .limit(1)

  const result = settings[0]

  return result ?? null
})
