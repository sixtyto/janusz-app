import process from 'node:process'
import { ServiceType } from '#shared/types/ServiceType'
import { useLogger } from '~~/server/utils/useLogger'

export default defineNitroPlugin(() => {
  const logger = useLogger(ServiceType.worker)

  logger.info('Starting Janusz Worker...')

  const worker = startWorker()

  function shutdown(): void {
    logger.info('Shutting down worker...')
    worker.close()
      .then(() => {
        process.exit(0)
      })
      .catch((error: unknown) => {
        logger.error('Error during shutdown:', { error })
        process.exit(1)
      })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
})
