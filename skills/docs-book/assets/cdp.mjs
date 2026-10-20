// A small Chrome DevTools Protocol client with no dependencies. It launches
// headless Chrome, opens pages, runs functions inside them, and takes
// screenshots. Needs Node 22 or later for the global WebSocket.
//
// Set CHROME to the Chrome binary on platforms other than macOS.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const chromePath =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'docs-book-chrome-'))
  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error(`Chrome didn't start. Is it at ${chromePath}?`)), 15000)
    proc.on('error', (err) => reject(err))
    proc.stderr.on('data', (chunk) => {
      buf += chunk
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    })
  })

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', (err) => reject(err))
  })

  let nextId = 1
  const pending = new Map()
  const listeners = new Set()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else if (msg.method) {
      for (const listener of listeners) listener(msg)
    }
  })

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })

  const waitFor = (method, sessionId, timeout) =>
    new Promise((resolve) => {
      const listener = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) done(true)
      }
      const timer = setTimeout(() => done(false), timeout)
      const done = (fired) => {
        clearTimeout(timer)
        listeners.delete(listener)
        resolve(fired)
      }
      listeners.add(listener)
    })

  async function newPage({ width = 1280, height = 900 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const call = (method, params) => send(method, params, sessionId)
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    })

    return {
      // Loads a URL and waits for the load event, then a short settle so
      // client-side rendering can finish. Returns the HTTP status if known.
      async goto(url, { settle = 1500, timeout = 30000 } = {}) {
        let status = null
        const onResponse = (msg) => {
          if (
            msg.sessionId === sessionId &&
            msg.method === 'Network.responseReceived' &&
            msg.params.type === 'Document' &&
            status === null
          )
            status = msg.params.response.status
        }
        listeners.add(onResponse)
        await call('Network.enable')
        const loaded = waitFor('Page.loadEventFired', sessionId, timeout)
        const nav = await call('Page.navigate', { url })
        if (nav.errorText) {
          listeners.delete(onResponse)
          throw new Error(`${nav.errorText} loading ${url}`)
        }
        await loaded
        await sleep(settle)
        listeners.delete(onResponse)
        return status
      },

      // Runs fn inside the page with arg, which must be JSON-serializable.
      // Returns fn's return value, which must be JSON-serializable too.
      async evaluate(fn, arg) {
        const { result, exceptionDetails } = await call('Runtime.evaluate', {
          expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`,
          returnByValue: true,
          awaitPromise: true,
        })
        if (exceptionDetails)
          throw new Error(exceptionDetails.exception?.description || exceptionDetails.text)
        return result.value
      },

      async setContent(html) {
        const { frameTree } = await call('Page.getFrameTree')
        await call('Page.setDocumentContent', { frameId: frameTree.frame.id, html })
        await sleep(300)
      },

      // Returns a PNG as a Buffer.
      async screenshot({ fullPage = false } = {}) {
        let clip
        if (fullPage) {
          const { cssContentSize } = await call('Page.getLayoutMetrics')
          clip = { x: 0, y: 0, width, height: Math.ceil(cssContentSize.height), scale: 1 }
        }
        const { data } = await call('Page.captureScreenshot', {
          format: 'png',
          ...(clip ? { clip, captureBeyondViewport: true } : {}),
        })
        return Buffer.from(data, 'base64')
      },

      close: () => send('Target.closeTarget', { targetId }),
    }
  }

  async function close() {
    try {
      await send('Browser.close')
    } catch {
      proc.kill()
    }
    ws.close()
    await sleep(200)
    rmSync(profile, { recursive: true, force: true })
  }

  return { newPage, close }
}
