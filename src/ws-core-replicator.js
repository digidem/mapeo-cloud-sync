import { pipeline } from 'streamx'
import { TypedEmitter } from 'tiny-typed-emitter'
import { createWebSocketStream, WebSocket } from 'ws'

import { once } from 'node:events'

import { WebsocketSafetyTransform } from './utils.js'

/**
 * @typedef {object} Events
 * @property {(data: import('ws').RawData, isBinary: boolean) => void} message
 */

/** @extends {TypedEmitter<Events>} */
export default class WebSocketHypercoreReplicator extends TypedEmitter {
  #ws
  /** @type {any} */
  #protocolStream
  #ended = false
  /**
   *
   * @param {WebSocket} ws
   * @param {any} protocolStream Hypercore or Corestore replication stream
   */
  constructor(ws, protocolStream) {
    super()
    this.#protocolStream = protocolStream
    this.#ws = ws
    const name = protocolStream.noiseStream.isInitiator ? 'client' : 'server'
    const conn = createWebSocketStream(ws)
    ws.on('close', (code, reason) => {
      console.log('ws close ' + name, code, reason.toString())
      this.emit('close')
    })
    ws.on('error', (code) => console.log('ws error ' + name, code))
    ws.on('message', (data, isBinary) => this.emit('message', data, isBinary))
    conn.on('error', (e) => console.log('conn error ' + name, e))
    console.log('ws state ' + name, ws.readyState)
    const onOpen = () => {
      // only start replicating once the websocket is connected, bail if end() already called
      if (this.#ended) return

      protocolStream.on('close', () => console.log('s close ' + name))
      protocolStream.on('end', () => console.log('s end ' + name))
      protocolStream.noiseStream.rawStream.on('end ' + name, () =>
        console.trace('END')
      )

      pipeline(
        conn,
        protocolStream,
        new WebsocketSafetyTransform(ws),
        conn,
        (err) => {
          if (err) console.log('stream error ' + name, err)
        }
      )
    }
    if (ws.readyState === ws.CONNECTING) {
      ws.on('open', onOpen)
    } else {
      onOpen()
    }
  }

  async end() {
    this.#ended = true
    const ws = this.#ws
    const protocolStream = this.#protocolStream

    if (ws.readyState === ws.CONNECTING) {
      ws.close()
    }
    if (protocolStream) {
      // Need to wait for `opened` to resolve, because `.end()` does not work during opening
      // @ts-ignore
      await protocolStream.opened
      protocolStream.end()
    }
    if (ws.readyState === ws.CLOSED) return
    await once(ws, 'close')
  }
}
