import { Type } from '@sinclair/typebox'
import Hyperdrive from 'hyperdrive'

import WebSocketHypercoreReplicator from './ws-core-replicator.js'

const HEX_REGEX_32_BYTES = '^[0-9a-fA-F]{64}$'
const HEX_STRING_32_BYTES = Type.String({ pattern: HEX_REGEX_32_BYTES })

/** @type {import('fastify').FastifyPluginAsync<Record<never, never>, import('fastify').RawServerDefault, import('@fastify/type-provider-typebox').TypeBoxTypeProvider>} */
export default async function routes(fastify) {
  fastify.register(async function (fastify) {
    fastify.get(
      '/sync/:projectKey',
      {
        websocket: true,
        schema: {
          params: Type.Object({
            projectKey: HEX_STRING_32_BYTES,
          }),
        },
      },
      async (conn, req) => {
        // @ts-ignore
        const key = Buffer.from(req.params.projectKey, 'hex')
        const { store, blockStore } = fastify
        const drive = new Hyperdrive(store, key, { blockStore })
        const replicator = new WebSocketHypercoreReplicator(
          conn.socket,
          store.replicate(false, { keepAlive: false })
        )
        // Need to await update before trying to download
        await drive.update({ wait: true })
        console.time('download')
        await drive.download({ recursive: true })
        console.timeEnd('download')
        replicator.on('message', (data) => console.log(data))
      }
    )
  })
}
