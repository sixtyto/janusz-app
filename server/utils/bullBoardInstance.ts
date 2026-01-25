import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { H3Adapter } from '@bull-board/h3'
import { getPrReviewQueue } from './getPrReviewQueue'

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolveBullBoardPaths() {
  const possiblePaths = [
    resolve(__dirname, '../../../node_modules/@bull-board/ui/dist'),
    resolve(__dirname, '../../../../node_modules/@bull-board/ui/dist'),
    resolve(process.cwd(), 'node_modules/@bull-board/ui/dist'),
  ]

  const basePath = possiblePaths.find((path) => {
    try {
      return fs.existsSync(path)
    } catch {
      return false
    }
  })

  if (!basePath) {
    console.warn('[BullBoard] Could not find @bull-board/ui dist folder. Static assets may not load correctly.')
    return {
      staticPath: resolve(__dirname, '../../../node_modules/@bull-board/ui/dist/static'),
      viewsPath: resolve(__dirname, '../../../node_modules/@bull-board/ui/dist'),
    }
  }

  return {
    staticPath: resolve(basePath, 'static'),
    viewsPath: basePath,
  }
}

let h3Router: ReturnType<H3Adapter['registerHandlers']> | undefined

export function getBullBoardRouter() {
  if (!h3Router) {
    try {
      const serverAdapter = new H3Adapter()
      serverAdapter.setBasePath('/admin/queue')

      const paths = resolveBullBoardPaths()
      serverAdapter.setStaticPath('/static', paths.staticPath)
      serverAdapter.setViewsPath(paths.viewsPath)

      serverAdapter.setErrorHandler((error: Error) => {
        return {
          status: 500 as const,
          body: { message: error.message },
        }
      })

      const queue = getPrReviewQueue()
      if (!queue) {
        throw new Error('Failed to initialize PR review queue')
      }

      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      })

      h3Router = serverAdapter.registerHandlers()
    } catch (error) {
      console.error('[BullBoard] Failed to initialize router:', error)
      throw error
    }
  }

  return h3Router
}
