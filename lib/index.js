/**
 * dsh-model-star —— 宿主半区。
 *
 * 唯一的职责：给浏览器半区提供一个「星标列表」的持久化接口。
 * 为什么不能只用 localStorage：Web 形态下 DSH 每次启动可能换端口，
 * localStorage 是按 origin 隔离的，换个端口收藏就全丢了。所以落盘到
 * $DSH_HOME/model-star.json，浏览器半区优先读它、失败再退回 localStorage。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ROUTE = '/dsh-model-star/api'

function storePath() {
  const fromEnv = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  const home = fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
  return join(home, 'model-star.json')
}

function send(res, code, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

async function readStore() {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data?.favorites) ? data.favorites.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function writeStore(favorites) {
  const file = storePath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ favorites }, null, 2), 'utf8')
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sanitize(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const value = item.trim()
    if (value.length === 0 || value.length > 320) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= 500) break
  }
  return out
}

/** Cross-site guard: only same-origin/local pages may touch the favorites file. */
function untrusted(req) {
  const site = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'] : ''
  return site === 'cross-site'
}

export default {
  name: 'dsh-model-star',
  apply(root) {
    root.inject(['webServer'], (ctx) => {
      const dispose = ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            if (untrusted(req)) {
              send(res, 403, { ok: false, error: 'cross-site request refused' })
              return
            }
            if (req.method === 'GET' || req.method === 'HEAD') {
              send(res, 200, { ok: true, favorites: await readStore() })
              return
            }
            if (req.method !== 'POST') {
              send(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const text = await readBody(req)
            let parsed
            try {
              parsed = JSON.parse(text)
            } catch {
              send(res, 400, { ok: false, error: 'body must be JSON' })
              return
            }
            if (!Array.isArray(parsed?.favorites)) {
              send(res, 400, { ok: false, error: 'favorites must be an array' })
              return
            }
            const favorites = sanitize(parsed.favorites)
            await writeStore(favorites)
            send(res, 200, { ok: true, favorites })
          } catch (error) {
            send(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      })
      ctx.effect(() => () => {
        try {
          dispose()
        } catch {
          /* already disposed */
        }
      })
    })
  },
}
