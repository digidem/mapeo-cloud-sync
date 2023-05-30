import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'

import { createHash } from 'node:crypto'

export default class S3BlockStore {
  #s3Client
  /**
   *
   * @param {object} opts
   * @param {string} opts.bucketName
   * @param {string} [opts.prefix]
   * @param {any} opts.tree
   * @param {import('@aws-sdk/client-s3').S3ClientConfig} opts.s3ClientConfig
   */
  constructor({ bucketName, prefix = '', tree, s3ClientConfig }) {
    this.tree = tree
    this.#s3Client = new S3Client(s3ClientConfig)
    this.bucketName = bucketName
    this.prefix = prefix.replace(/\/$/, '') + '/'
  }

  /** @param {number} i */
  async get(i) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.prefix + i,
    })
    const response = await this.#s3Client.send(command)
    return getBuffer(response)
  }

  /**
   *
   * @param {number} i
   * @param {Buffer} data
   * @param {number} offset
   */
  async put(i, data, offset) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: this.prefix + i,
      Body: data,
      ContentMD5: createHash('md5').update(data).digest('base64'),
    })
    await this.#s3Client.send(command)
    return offset + data.byteLength
  }

  /**
   *
   * @param {number} i
   * @param {Buffer[]} batch
   * @param {number} offset
   * @returns
   */
  async putBatch(i, batch, offset) {
    if (batch.length === 0) return Promise.resolve()
    await Promise.all(
      batch.map((buf, index) => {
        return this.put(i + index, buf, 0)
      })
    )
    return batch.reduce((acc, cur) => {
      return acc + cur.byteLength
    }, offset)
  }

  // no-op
  async clear() {}

  async close() {
    this.#s3Client.destroy()
  }
}

/**
 * Efficiently get a Buffer from an s3 response (which returns a readable stream)
 *
 * @param {import('@aws-sdk/client-s3').GetObjectCommandOutput} response
 */
async function getBuffer(response) {
  const buf = Buffer.allocUnsafe(response.ContentLength || 0)
  const stream = /** @type {import('node:stream').Readable} */ (response.Body)
  let offset = 0
  return new Promise((res, rej) => {
    stream.on('error', rej)
    stream.on('data', (chunk) => {
      chunk.copy(buf, offset)
      offset += chunk.length
    })
    stream.on('end', () => {
      res(buf)
    })
  })
}
