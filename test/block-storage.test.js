import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hypercore from 'hypercore'
import { discoveryKey } from 'hypercore-crypto'
import Hyperdrive from 'hyperdrive'
import RAM from 'random-access-memory'
import test from 'tape'

import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import S3BlockStore from '../src/s3-block-store.js'
import { env } from './helpers.js'

const __filename = new URL(import.meta.url).pathname
const require = createRequire(import.meta.url)

test('basic', async function (t) {
  const core = await createCore(t.teardown)
  let appends = 0

  t.is(core.length, 0)
  t.is(core.writable, true)
  t.is(core.readable, true)

  core.on('append', function () {
    appends++
  })

  await core.append('hello')
  await core.append('world')

  const info = await core.info()

  t.is(core.length, 2)
  t.is(info.byteLength, 10)
  t.is(appends, 2)
})

test('has', async function (t) {
  const core = await createCore(t.teardown)
  await core.append(['a', 'b', 'c', 'd', 'e', 'f'])

  for (let i = 0; i < core.length; i++) {
    t.ok(await core.has(i), `has ${i}`)
  }

  await core.clear(2)
  t.comment('2 cleared')

  for (let i = 0; i < core.length; i++) {
    if (i === 2) {
      t.notOk(await core.has(i), `does not have ${i}`)
    } else {
      t.ok(await core.has(i), `has ${i}`)
    }
  }
})

test('has range', async function (t) {
  const core = await createCore(t.teardown)
  await core.append(['a', 'b', 'c', 'd', 'e', 'f'])

  t.ok(await core.has(0, 5), 'has 0 to 4')

  await core.clear(2)
  t.comment('2 cleared')

  t.notOk(await core.has(0, 5), 'does not have 0 to 4')
  t.ok(await core.has(0, 2), 'has 0 to 1')
  t.ok(await core.has(3, 5), 'has 3 to 4')
})

test('Hyperdrive(corestore, key)', async (t) => {
  t.plan(2)
  const { corestore, drive } = await createDrive(t.teardown)
  const diskbuf = fs.readFileSync(__filename)
  await drive.put(__filename, diskbuf)
  const bndlbuf = await drive.get(__filename)
  t.is(b4a.compare(diskbuf, bndlbuf), 0)
  const mirror = new Hyperdrive(corestore, drive.core.key)
  await mirror.ready()
  const mrrrbuf = await mirror.get(__filename)
  t.is(b4a.compare(bndlbuf, mrrrbuf), 0)
})

test('drive.put(path, buf) and drive.get(path)', async (t) => {
  {
    const { drive } = await createDrive(t.teardown)
    const diskbuf = fs.readFileSync(__filename)
    await drive.put(__filename, diskbuf)
    const bndlbuf = await drive.get(__filename)
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
  }

  {
    const { drive } = await createDrive(t.teardown)
    const tmppath = path.join(os.tmpdir(), 'hyperdrive-test-')
    const dirpath = fs.mkdtempSync(tmppath)
    const filepath = path.join(dirpath, 'hello-world.js')
    const bndlbuf = b4a.from("module.exports = () => 'Hello, World!'")
    await drive.put(filepath, bndlbuf)
    fs.writeFileSync(filepath, await drive.get(filepath))
    const diskbuf = fs.readFileSync(filepath)
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
    t.is(require(filepath)(), 'Hello, World!')
  }
})

/** @param {test.Test['teardown']} teardown */
export async function createCore(teardown) {
  const core = new Hypercore(RAM, { blockStore: createBlockStore })
  await core.ready()
  teardown(async () => {
    const prefix = core.discoveryKey.toString('hex')
    const s3Client = new S3Client(s3ClientConfig)
    const promises = []
    for (let i = 0; i < core.length; i++) {
      promises.push(deleteObject(s3Client, prefix + '/' + i))
    }
    await Promise.all(promises)
    s3Client.destroy()
  })
  return core
}

/** @param {test.Test['teardown']} teardown */
export async function createDrive(teardown) {
  const corestore = new Corestore(RAM)
  const drive = new Hyperdrive(corestore, { blockStore: createBlockStore })
  await drive.ready()
  teardown(async () => {
    const prefix = discoveryKey(drive.contentKey).toString('hex')
    const s3Client = new S3Client(s3ClientConfig)
    const promises = []
    for (let i = 0; i < drive.blobs?.core.length; i++) {
      promises.push(deleteObject(s3Client, prefix + '/' + i))
    }
    await Promise.all(promises)
    s3Client.destroy()
  })
  return { drive, corestore }
}

/**
 *
 * @param {S3Client} s3Client
 * @param {string} key
 * @returns
 */
async function deleteObject(s3Client, key) {
  const command = new DeleteObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
  })
  return s3Client.send(command)
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
