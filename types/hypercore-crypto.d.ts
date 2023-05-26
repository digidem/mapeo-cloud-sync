declare module 'hypercore-crypto' {
  const crypto = {
    discoveryKey(publicKey: Buffer): Buffer
  }

  export = crypto
}
