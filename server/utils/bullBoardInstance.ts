import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { getPrReviewQueue } from './getPrReviewQueue'

let bullBoardMiddleware: ReturnType<ExpressAdapter['getRouter']> | undefined

export function getBullBoardMiddleware() {
  if (!bullBoardMiddleware) {
    const serverAdapter = new ExpressAdapter()
    serverAdapter.setBasePath('/admin/queue')

    createBullBoard({
      queues: [new BullMQAdapter(getPrReviewQueue())],
      serverAdapter,
    })

    bullBoardMiddleware = serverAdapter.getRouter()
  }

  return bullBoardMiddleware
}
