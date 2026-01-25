import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { H3Adapter } from '@bull-board/h3'
import { getPrReviewQueue } from './getPrReviewQueue'

let bullBoardHandler: ReturnType<H3Adapter['registerHandlers']> | undefined

export function getBullBoardHandler() {
  if (!bullBoardHandler) {
    const serverAdapter = new H3Adapter()
    serverAdapter.setBasePath('/admin/queue')

    const queue = getPrReviewQueue()
    if (!queue) {
      throw new Error('Failed to initialize PR review queue')
    }

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
    })

    bullBoardHandler = serverAdapter.registerHandlers()
  }

  return bullBoardHandler
}
