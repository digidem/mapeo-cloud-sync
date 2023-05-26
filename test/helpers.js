import crypto from 'node:crypto'
import { Transform } from 'node:stream'
import Hypercore from 'hypercore'
import Hyperdrive from 'hyperdrive'
import Corestore from 'corestore'
import RAM from 'random-access-memory'
import S3BlockStore from '../src/s3-block-store.js'
import { discoveryKey } from 'hypercore-crypto'

/**
 * @param {string} alg
 * @returns {Transform & { digest: crypto.Hash['digest'] }}
 */
export function createHashStream(alg = 'sha256') {
  const hash = crypto.createHash(alg)
  const stream = new Transform({
    transform(chunk, enc, cb) {
      try {
        hash.update(chunk)
        cb(null, chunk)
      } catch (err) {
        // @ts-ignore
        cb(err)
      }
    },
  })
  // @ts-ignore
  stream.digest = hash.digest.bind(hash)
  // @ts-ignore
  return stream
}

/** @type {import('../server.js').EnvConfig} */
export const env = {
  AWS_ACCESS_KEY_ID: 'minioadmin',
  AWS_SECRET_ACCESS_KEY: 'minioadmin',
  AWS_S3_REGION: 'us-east-1',
  AWS_S3_ENDPOINT: 'http://127.0.0.1:9000',
  AWS_S3_BUCKET: 'test',
  PORT: '3000',
  // can override these in CI
  ...process.env,
}

export async function eventFlush() {
  await new Promise((resolve) => setImmediate(resolve))
}

/** @type {(...args: any[]) => Promise<Hypercore>} */
export async function createCore(...args) {
  const core = new Hypercore(RAM, { blockStore: createBlockStore, ...args })
  await core.ready()
  return core
}

/** @type {(...args: any[]) => Promise<{ drive: Hyperdrive, corestore: Corestore }>} */
export async function createDrive(...args) {
  const corestore = new Corestore(RAM)
  const drive = new Hyperdrive(corestore, {
    blockStore: createBlockStore,
    ...args,
  })
  await drive.ready()
  return { drive, corestore }
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

/** @type {import('../src/app.js').BlockStoreOption} */
const createBlockStore = (key, tree) => {
  return new S3BlockStore({
    bucketName: env.AWS_S3_BUCKET,
    tree,
    prefix: discoveryKey(key).toString('hex'),
    s3ClientConfig,
  })
}
