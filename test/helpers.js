import crypto from 'node:crypto'
import { Transform } from 'node:stream'

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
