import process from 'node:process'
import { ServiceType } from '#shared/types/ServiceType'
import { shutdownCleanup } from '~~/server/utils/repo-cache/cleanupService'
import { useLogger } from '~~/server/utils/useLogger'

export default defineNitroPlugin(() => {
  const logger = useLogger(ServiceType.worker)

  logger.info('Starting Janusz Worker...')

  const worker = startWorker()
  let isShuttingDown = false

  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true

    logger.info('Shutting down worker...')

    try {
      await worker.close()
      logger.info('Worker closed successfully')
    } catch (error) {
      logger.error('Error during worker shutdown:', { error })
      process.exit(1)
    }

    try {
      await shutdownCleanup()
      logger.info('Repo cache cleanup completed')
    } catch (error) {
      logger.error('Error during repo cache cleanup:', { error })
    }

    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
})
