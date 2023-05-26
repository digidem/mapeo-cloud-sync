import test from 'tape'
import { createCore, createDrive } from './helpers.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import b4a from 'b4a'
import Hyperdrive from 'hyperdrive'
import { createRequire } from 'node:module'

const __filename = new URL(import.meta.url).pathname
const require = createRequire(import.meta.url)

test('basic', async function (t) {
  const core = await createCore()
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
  const core = await createCore()
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
  const core = await createCore()
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
  const { corestore, drive } = await createDrive()
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
    const { drive } = await createDrive()
    const diskbuf = fs.readFileSync(__filename)
    await drive.put(__filename, diskbuf)
    const bndlbuf = await drive.get(__filename)
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
  }

  {
    const { drive } = await createDrive()
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
