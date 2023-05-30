import fastifyWebsocket from '@fastify/websocket'
import Corestore from 'corestore'
import createFastify from 'fastify'
import RAM from 'random-access-memory'

import routes from './routes.js'

/** @typedef {(key: Buffer, tree: any) => import('./s3-block-store.js').default} BlockStoreOption */

/**
 *
 * @param {object} opts
 * @param {any} [opts.storage]
 * @param {BlockStoreOption} [opts.blockStore]
 * @param {import('fastify').FastifyServerOptions['logger']} [opts.logger] Fastify logging options (default `false`)
 * @returns
 */
export default function createServer({ storage = RAM, blockStore, logger }) {
  const fastify = createFastify({ logger })
  fastify.decorate('store', new Corestore(storage))
  fastify.decorate('blockStore', blockStore)
  fastify.register(fastifyWebsocket)
  fastify.register(routes)
  return fastify
}
