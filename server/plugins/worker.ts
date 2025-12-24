import process from 'node:process'
import { ServiceType } from '#shared/types/ServiceType'

export default defineNitroPlugin(() => {
  const logger = createLogger(ServiceType.worker)

  logger.info('Starting Janusz Worker...')

  const worker = startWorker()

  async function shutdown() {
    logger.info('Shutting down worker...')
    await worker.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
})
