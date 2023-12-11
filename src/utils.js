import { Transform } from 'streamx'

/** @typedef {Transform<Buffer, Buffer>} TStream */

/**
 * Ensures that data is not written to a Websocket that is closing or is closed
 * (which would throw an error).
 */
export class WebsocketSafetyTransform extends Transform {
  #ws

  /**
   *
   * @param {import('ws').WebSocket} ws
   * @param {import('streamx').TransformOptions<TStream, Buffer, Buffer>} [opts]
   */
  constructor(ws, opts) {
    super(opts)
    this.#ws = ws
  }

  /** @type {TStream['_transform']} */
  _transform(data, cb) {
    if (this.#ws.readyState >= this.#ws.CLOSING) return cb()
    cb(null, data)
  }
}
