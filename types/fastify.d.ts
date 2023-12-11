import { type BlockStoreOption } from '../src/app.js'

declare module 'fastify' {
  interface FastifyInstance {
    store: any // Corestore
    blockStore: BlockStoreOption
  }
}
