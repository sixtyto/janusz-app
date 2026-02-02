import { ServiceType } from '#shared/types/ServiceType'
import { startPeriodicCleanup, startupCleanup } from '~~/server/utils/repo-cache/cleanupService'
import { useLogger } from '~~/server/utils/useLogger'

export default defineNitroPlugin(async () => {
  const logger = useLogger(ServiceType.repoIndexer)

  logger.info('Starting repo cleanup cron service')

  try {
    const result = await startupCleanup()
    logger.info('Startup cleanup completed', {
      orphanedWorkTreesCleaned: result.orphanedWorkTreesCleaned,
      staleLocksCleaned: result.staleLocksCleaned,
      bytesFreed: result.bytesFreed,
      errorCount: result.errors.length,
    })
  } catch (error) {
    logger.error('Startup cleanup failed', { error })
  }

  startPeriodicCleanup()

  logger.info('Repo cleanup cron service started')
})
