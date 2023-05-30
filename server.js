import { discoveryKey } from 'hypercore-crypto'

import assert from 'node:assert'

import createServer from './src/app.js'
import S3BlockStore from './src/s3-block-store.js'

const requiredEnv = /** @type {const} */ ([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_ENDPOINT',
  'AWS_S3_REGION',
  'AWS_S3_BUCKET',
])

/** @typedef {typeof process.env & Record<(typeof requiredEnv)[number], string>} EnvConfig */

const env = /** @type {EnvConfig}*/ (process.env)

for (const key of requiredEnv) {
  assert.equal(
    typeof env[key],
    'string',
    `missing require environment variable ${key}`
  )
}

/** @type {import('@aws-sdk/client-s3').S3ClientConfig} */
const s3ClientConfig = {
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
  region: env.AWS_S3_REGION,
  endpoint: env.AWS_S3_ENDPOINT,
  forcePathStyle: true,
}

/** @type {import('./src/app.js').BlockStoreOption} */
const createBlockStore = (key, tree) => {
  return new S3BlockStore({
    bucketName: env.AWS_S3_BUCKET,
    tree,
    prefix: discoveryKey(key).toString('hex'),
    s3ClientConfig,
  })
}

const fastify = createServer({
  logger: true,
  // storage: './data',
  blockStore: createBlockStore,
})

const port = typeof process.env.PORT === 'string' ? +process.env.PORT : 3000

try {
  await fastify.listen({ port, host: '::' })
  if (process.send) {
    process.send('listening')
  }
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

/** @param {NodeJS.Signals} signal*/
async function closeGracefully(signal) {
  console.log(`Received signal to terminate: ${signal}`)
  await fastify.close()
  console.log('Gracefully closed fastify')
  process.kill(process.pid, signal)
}
process.once('SIGINT', closeGracefully)
process.once('SIGTERM', closeGracefully)
