import BlockStream from 'block-stream2'
import Corestore from 'corestore'
import { execaNode } from 'execa'
import Hyperdrive from 'hyperdrive'
import RAM from 'random-access-memory'
import randomBytesReadableStream from 'random-bytes-readable-stream'
import test from 'tape'
import { WebSocket } from 'ws'

import { once } from 'node:events'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'

import WebSocketHypercoreReplicator from '../src/ws-core-replicator.js'
import { createHashStream, env } from './helpers.js'

const dataFolder = new URL('../data', import.meta.url)
fs.rmSync(dataFolder, { recursive: true, force: true })

const Mb = 1024 * 1024 // Megabyte
const serverUrl = new URL(`ws://127.0.0.1:${env.PORT}`)

test('replicate', async (t) => {
  const closeServer = await createServer()
  const store = new Corestore(RAM)
  const drive = new Hyperdrive(store)
  await drive.ready()
  const driveId = drive.key.toString('hex')

  const hashes = await writeRandomData(drive, { count: 5 })
  const url = new URL(`/sync/${driveId}`, serverUrl)
  const ws = new WebSocket(url)
  const replicator = new WebSocketHypercoreReplicator(
    ws,
    store.replicate(true, { keepAlive: false })
  )
  replicator.on('message', (data) => console.log('client receive', data))
  await once(replicator, 'close')
})

/**
 * Write random files to a hyperdrive
 *
 * @param {Hyperdrive} drive
 * @param {object} opts
 * @param {number} opts.count How many files to write
 * @param {number} [opts.min] Min size of files in bytes (default 1Mb)
 * @param {number} [opts.max] Max size of files in bytes (default 5Mb)
 * @param {number} [opts.chunkSize] Size of chunks to write to content hypercore (default 256Kb)
 * @param {{ count: number, min?: number, max?: number}} opts
 * @returns {Promise<string[]>} Array of hashes of data written to the drive
 */
async function writeRandomData(
  drive,
  { count, min = 1 * Mb, max = 5 * Mb, chunkSize = 256 * 1024 }
) {
  const writePromises = []
  const hashStreams = []
  for (let i = 0; i < count; i++) {
    const rs = randomBytesReadableStream({ size: random(min, max) })
    const hash = createHashStream('md5')
    const blockStream = new BlockStream({
      size: chunkSize,
      zeroPadding: false,
    })
    const ws = drive.createWriteStream(`/${i}.bin`)
    writePromises.push(pipeline(rs, hash, blockStream, ws))
    hashStreams.push(hash)
  }
  await Promise.all(writePromises)
  return hashStreams.map((s) => s.digest('hex'))
}

/**
 * Create random integer in range min,max
 * @param {number} min
 * @param {number} max
 */
function random(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

async function createServer() {
  const serverProc = execaNode('./server.js', [], { env, stdio: 'inherit' })
  await once(serverProc, 'message')
  return async () => {
    serverProc.kill()
    const [code, signal] = await once(serverProc, 'close')
    console.log({ code, signal })
  }
}
