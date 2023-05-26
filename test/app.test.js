import RAM from 'random-access-memory'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import test from 'tape'
import fs from 'node:fs'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { pipeline } from 'node:stream/promises'
import BlockStream from 'block-stream2'
import randomBytesReadableStream from 'random-bytes-readable-stream'
import { execaNode } from 'execa'
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

  const writePromises = []
  const hashes = []
  for (let i = 0; i < 100; i++) {
    const rs = randomBytesReadableStream({ size: random(1 * Mb, 5 * Mb) })
    const hash = createHashStream('md5')
    const blockStream = new BlockStream({
      size: 512 * 1024,
      zeroPadding: false,
    })
    const ws = drive.createWriteStream(`/${i}.bin`)
    writePromises.push(pipeline(rs, hash, blockStream, ws))
    hashes.push(hash)
  }
  await Promise.all(writePromises)
  const url = new URL(`/sync/${driveId}`, serverUrl)
  const ws = new WebSocket(url)
  const replicator = new WebSocketHypercoreReplicator(ws, store.replicate(true))
})

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
