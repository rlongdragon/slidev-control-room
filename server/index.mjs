import { createServer } from 'node:http'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import httpProxy from 'http-proxy'
import YAML from 'yaml'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const decksRoot = path.join(root, 'decks')
const publicRoot = path.join(root, 'public')
const builtSlidesRoot = path.join(root, 'dist', 'slides')
const thumbnailRoot = path.join(root, 'dist', 'thumbnails')
const stateFile = process.env.STATE_FILE
  ? path.resolve(root, process.env.STATE_FILE)
  : path.join(root, 'data', 'decks.json')
const dataRoot = path.dirname(stateFile)

const port = numberFromEnv('PORT', 3000)
const slidevPort = numberFromEnv('SLIDEV_PORT', 3031)
const configuredPassword = process.env.ADMIN_PASSWORD?.trim()
const adminPassword = configuredPassword || randomBytes(12).toString('base64url')
const sessionSecret = process.env.SESSION_SECRET?.trim() || randomBytes(32).toString('base64url')
const remotePassword = process.env.REMOTE_PASSWORD?.trim() || randomBytes(18).toString('base64url')
const secureCookies = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'

const app = express()
const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${slidevPort}`,
  changeOrigin: true,
  ws: true,
})

const publicationState = await loadPublicationState()
const loginAttempts = new Map()
let live = emptyLiveState()
let transition = Promise.resolve()
let stateWrite = Promise.resolve()

app.disable('x-powered-by')
app.use(express.json({ limit: '16kb', type: 'application/json' }))
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'same-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (!request.path.startsWith('/slide/') && !request.path.startsWith('/export/')) {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  }
  next()
})

app.get('/', (_request, response) => response.redirect(302, '/release'))
app.get(['/release', '/release/'], (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.sendFile(path.join(publicRoot, 'release.html'))
})
app.get(['/slides', '/slides/'], (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.sendFile(path.join(publicRoot, 'admin.html'))
})

app.get('/api/releases', async (_request, response, next) => {
  try {
    const decks = (await discoverDecks()).filter(deck => deck.isPublished && deck.previewAvailable)
    response.json({ decks, live: publicLiveState() })
  }
  catch (error) {
    next(error)
  }
})

app.get('/api/auth', (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json({ authenticated: isAuthenticated(request) })
})

app.post('/api/auth/login', (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  const key = request.ip || request.socket.remoteAddress || 'unknown'
  if (isRateLimited(key)) {
    response.status(429).json({ error: '登入嘗試過多，請稍後再試。' })
    return
  }

  const supplied = typeof request.body?.password === 'string' ? request.body.password : ''
  if (!safeSecretEqual(supplied, adminPassword)) {
    recordFailedLogin(key)
    response.status(401).json({ error: '密碼不正確。' })
    return
  }

  loginAttempts.delete(key)
  response.setHeader('Set-Cookie', createSessionCookie())
  response.json({ authenticated: true })
})

app.post('/api/auth/logout', requireAdmin, (_request, response) => {
  response.setHeader('Set-Cookie', clearSessionCookie())
  response.json({ authenticated: false })
})

app.get('/api/admin/decks', requireAdmin, async (_request, response, next) => {
  try {
    response.setHeader('Cache-Control', 'no-store')
    response.json({ decks: await discoverDecks(), live: publicLiveState() })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/admin/decks/:slug/publish', requireAdmin, async (request, response, next) => {
  try {
    const slug = assertSafeSlug(request.params.slug)
    const published = request.body?.published
    if (typeof published !== 'boolean')
      throw httpError(400, 'published 必須是布林值。')

    const decks = await discoverDecks()
    if (!decks.some(deck => deck.slug === slug))
      throw httpError(404, '找不到這份簡報。')

    if (!published && live.deck?.slug === slug)
      await queueTransition(stopDeck)

    if (published)
      publicationState.add(slug)
    else
      publicationState.delete(slug)

    await savePublicationState()
    const updated = (await discoverDecks()).find(deck => deck.slug === slug)
    response.json({ deck: updated, live: publicLiveState() })
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/admin/live/:slug/start', requireAdmin, async (request, response, next) => {
  try {
    const slug = assertSafeSlug(request.params.slug)
    if (!publicationState.has(slug))
      throw httpError(409, '請先公開這份簡報，再進入簡報模式。')
    const result = await queueTransition(() => startDeck(slug))
    response.json(result)
  }
  catch (error) {
    next(error)
  }
})

app.post('/api/admin/live/stop', requireAdmin, async (_request, response, next) => {
  try {
    await queueTransition(stopDeck)
    response.json({ live: publicLiveState() })
  }
  catch (error) {
    next(error)
  }
})

app.use('/slide', (request, response, next) => {
  const slug = slugFromSlidePath(request.path)
  if (!slug || (!publicationState.has(slug) && !isAuthenticated(request))) {
    sendNotFound(response)
    return
  }
  next()
})
app.use('/slide', express.static(builtSlidesRoot, { extensions: ['html'], redirect: true }))
app.use('/export', (request, response, next) => {
  const slug = slugFromSlidePath(request.path)
  if (!slug || (!publicationState.has(slug) && !isAuthenticated(request))) {
    sendNotFound(response)
    return
  }
  next()
})
app.use('/export', express.static(builtSlidesRoot, { extensions: ['html'], redirect: true }))
app.use('/thumbnails', express.static(thumbnailRoot, { dotfiles: 'deny', fallthrough: false }))
app.use(express.static(publicRoot, { index: false, dotfiles: 'deny' }))

app.use('/api', (_request, response) => {
  response.status(404).json({ error: '找不到這個 API。' })
})
app.use((_request, response) => sendNotFound(response))

app.use((error, _request, response, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500
  if (status >= 500)
    console.error(error)
  response.status(status).json({
    error: status === 500 ? '服務暫時無法完成操作，請稍後再試。' : error.message,
  })
})

const server = createServer((request, response) => {
  if (isLiveStateWrite(request)) {
    if (!isAuthenticated(request)) {
      response.writeHead(401, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end(JSON.stringify({ error: '請先登入。', code: 'AUTH_REQUIRED' }))
      return
    }

    if (live.state !== 'running') {
      response.writeHead(409, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end(JSON.stringify({ error: '目前沒有進行中的簡報。' }))
      return
    }

    proxy.web(request, response, undefined, (error) => {
      console.error('Live state proxy error:', error.message)
      if (!response.headersSent)
        sendLiveUnavailable(response)
    })
    return
  }

  const slug = slugFromRequestUrl(request.url)
  if (slug && live.state === 'running' && live.deck?.slug === slug) {
    proxy.web(request, response, undefined, (error) => {
      console.error('Live proxy error:', error.message)
      if (!response.headersSent)
        sendLiveUnavailable(response)
    })
    return
  }

  app(request, response)
})

server.on('upgrade', (request, socket, head) => {
  const slug = slugFromRequestUrl(request.url)
  if (slug && live.state === 'running' && live.deck?.slug === slug) {
    proxy.ws(request, socket, head)
    return
  }
  socket.destroy()
})

proxy.on('error', error => console.error('Proxy error:', error.message))

server.listen(port, '0.0.0.0', () => {
  console.log(`Slidev Control Room: http://localhost:${port}/slides`)
  console.log(`Public releases: http://localhost:${port}/release`)
  console.log(`Live Slidev upstream: http://127.0.0.1:${slidevPort}`)
  if (!configuredPassword)
    console.log(`Temporary admin password: ${adminPassword}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await stopDeck()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 3_000).unref()
  })
}

function numberFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function emptyLiveState() {
  return { child: null, deck: null, state: 'idle', startedAt: null, message: null }
}

function requireAdmin(request, response, next) {
  if (isAuthenticated(request)) {
    next()
    return
  }
  response.status(401).json({ error: '請先登入。', code: 'AUTH_REQUIRED' })
}

function createSessionCookie() {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url')
  const signature = sign(payload)
  return `slidev_session=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secureCookies ? '; Secure' : ''}`
}

function clearSessionCookie() {
  return `slidev_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? '; Secure' : ''}`
}

function isAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie || '')
  const token = cookies.slidev_session
  if (!token)
    return false
  const separator = token.lastIndexOf('.')
  if (separator < 1)
    return false

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!safeSecretEqual(signature, sign(payload)))
    return false

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isFinite(session.exp) && session.exp > Date.now()
  }
  catch {
    return false
  }
}

function parseCookies(header) {
  const result = {}
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1)
      continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key)
      result[key] = value
  }
  return result
}

function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('base64url')
}

function safeSecretEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left)).digest()
  const rightHash = createHash('sha256').update(String(right)).digest()
  return timingSafeEqual(leftHash, rightHash)
}

function isRateLimited(key) {
  const record = loginAttempts.get(key)
  if (!record)
    return false
  if (record.resetAt <= Date.now()) {
    loginAttempts.delete(key)
    return false
  }
  return record.count >= 8
}

function recordFailedLogin(key) {
  const existing = loginAttempts.get(key)
  if (!existing || existing.resetAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + 5 * 60 * 1000 })
    return
  }
  existing.count += 1
}

function queueTransition(operation) {
  const pending = transition.then(operation, operation)
  transition = pending.catch(() => {})
  return pending
}

async function discoverDecks() {
  let entries = []
  try {
    entries = await readdir(decksRoot, { withFileTypes: true })
  }
  catch (error) {
    if (error.code === 'ENOENT')
      return []
    throw error
  }

  const decks = await Promise.all(entries
    .filter(entry => entry.isDirectory() && isSafeSlug(entry.name))
    .map(async (entry) => {
      const source = path.join(decksRoot, entry.name, 'slides.md')
      try {
        const [markdown, sourceStat] = await Promise.all([readFile(source, 'utf8'), stat(source)])
        const meta = parseHeadmatter(markdown)
        const output = path.join(builtSlidesRoot, entry.name, 'index.html')
        const thumbnail = path.join(thumbnailRoot, `${entry.name}.png`)
        const thumbnailAvailable = await exists(thumbnail)
        return {
          slug: entry.name,
          title: cleanText(meta.title) || titleFromSlug(entry.name),
          description: cleanText(meta.info) || cleanText(meta.description) || 'Slidev 簡報',
          updatedAt: sourceStat.mtime.toISOString(),
          previewAvailable: await exists(output),
          publicUrl: `/slide/${encodeURIComponent(entry.name)}/`,
          exportUrl: `/export/${encodeURIComponent(entry.name)}/#/export`,
          thumbnailUrl: thumbnailAvailable ? `/thumbnails/${encodeURIComponent(entry.name)}.png?v=${sourceStat.mtimeMs}` : null,
          isPublished: publicationState.has(entry.name),
          isLive: live.deck?.slug === entry.name && live.state === 'running',
        }
      }
      catch (error) {
        if (error.code === 'ENOENT')
          return null
        throw error
      }
    }))

  return decks.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'))
}

function parseHeadmatter(markdown) {
  if (!markdown.startsWith('---'))
    return {}
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)
  if (!match)
    return {}
  try {
    return YAML.parse(match[1]) || {}
  }
  catch {
    return {}
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function titleFromSlug(slug) {
  return slug.split(/[-_]/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function isSafeSlug(slug) {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)
}

function assertSafeSlug(slug) {
  if (!isSafeSlug(slug))
    throw httpError(400, '簡報 ID 格式不正確。')
  return slug
}

function slugFromSlidePath(requestPath) {
  const segment = requestPath.split('/').filter(Boolean)[0]
  return segment && isSafeSlug(segment) ? segment : null
}

function slugFromRequestUrl(requestUrl = '') {
  try {
    const pathname = new URL(requestUrl, 'http://localhost').pathname
    const match = pathname.match(/^\/slide\/([^/]+)(?:\/|$)/)
    if (!match)
      return null
    const slug = decodeURIComponent(match[1])
    return isSafeSlug(slug) ? slug : null
  }
  catch {
    return null
  }
}

function isLiveStateWrite(request) {
  if (request.method !== 'POST')
    return false
  try {
    const pathname = new URL(request.url || '', 'http://localhost').pathname
    return pathname.startsWith('/@server-reactive/') || pathname.startsWith('/@server-ref/')
  }
  catch {
    return false
  }
}

async function startDeck(slug) {
  const decks = await discoverDecks()
  const deck = decks.find(item => item.slug === slug)
  if (!deck)
    throw httpError(404, '找不到這份簡報。')
  if (!deck.previewAvailable)
    throw httpError(409, '這份簡報尚未 build，請先執行 npm run build。')
  if (live.deck?.slug === slug && live.state === 'running')
    return startedPayload(deck)

  await stopDeck()
  const source = path.join(decksRoot, slug, 'slides.md')
  const deckSlidevBin = path.join(path.dirname(source), 'node_modules', '@slidev', 'cli', 'bin', 'slidev.mjs')
  await access(deckSlidevBin)
  live = { child: null, deck: { slug, title: deck.title }, state: 'starting', startedAt: null, message: null }

  const child = spawn(process.execPath, [
    deckSlidevBin,
    source,
    `--remote=${remotePassword}`,
    '--base', `/slide/${slug}/`,
    '--port', String(slidevPort),
    '--bind', '127.0.0.1',
    '--force',
    '--log', 'warn',
  ], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development', BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  live.child = child
  child.stdout.on('data', chunk => process.stdout.write(`[slidev:${slug}] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[slidev:${slug}] ${chunk}`))
  child.once('exit', (code, signal) => {
    if (live.child !== child)
      return
    live = {
      ...live,
      child: null,
      state: code === 0 || signal === 'SIGTERM' ? 'idle' : 'error',
      message: code === 0 || signal === 'SIGTERM' ? null : `Slidev 已停止（code ${code ?? signal}）。`,
    }
  })

  try {
    await waitUntilReady(child, slug)
    live.state = 'running'
    live.startedAt = new Date().toISOString()
    return startedPayload(deck)
  }
  catch (error) {
    await terminateChild(child)
    live = { child: null, deck: null, state: 'error', startedAt: null, message: error.message }
    throw httpError(502, `無法啟動簡報：${error.message}`)
  }
}

async function stopDeck() {
  const child = live.child
  live = emptyLiveState()
  if (child)
    await terminateChild(child)
}

async function terminateChild(child) {
  if (child.exitCode !== null || child.signalCode)
    return
  child.kill('SIGTERM')
  const exited = new Promise(resolve => child.once('exit', resolve))
  const timedOut = new Promise(resolve => setTimeout(resolve, 2_500, 'timeout'))
  if (await Promise.race([exited, timedOut]) === 'timeout' && child.exitCode === null)
    child.kill('SIGKILL')
}

async function waitUntilReady(child, slug) {
  const deadline = Date.now() + 30_000
  let lastError = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Slidev 提前停止（code ${child.exitCode}）`)
    try {
      const response = await fetch(`http://127.0.0.1:${slidevPort}/slide/${encodeURIComponent(slug)}/`, {
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok)
        return
      lastError = new Error(`HTTP ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(lastError?.message || '等待 Slidev 啟動逾時')
}

function startedPayload(deck) {
  const query = new URLSearchParams({ password: remotePassword }).toString()
  return {
    live: publicLiveState(),
    audienceUrl: `/slide/${encodeURIComponent(deck.slug)}/`,
    presenterUrl: `/slide/${encodeURIComponent(deck.slug)}/presenter/?${query}`,
    deck: { slug: deck.slug, title: deck.title },
  }
}

function publicLiveState() {
  return {
    state: live.state,
    deck: live.deck,
    startedAt: live.startedAt,
    message: live.message,
    audienceUrl: live.state === 'running' && live.deck ? `/slide/${encodeURIComponent(live.deck.slug)}/` : null,
  }
}

async function loadPublicationState() {
  await mkdir(dataRoot, { recursive: true })
  try {
    const raw = JSON.parse(await readFile(stateFile, 'utf8'))
    return new Set(Array.isArray(raw.published) ? raw.published.filter(isSafeSlug) : [])
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      console.error('Could not read publication state:', error.message)
    return new Set()
  }
}

function savePublicationState() {
  const payload = `${JSON.stringify({ published: [...publicationState].sort() }, null, 2)}\n`
  stateWrite = stateWrite.then(async () => {
    const temporary = path.join(dataRoot, `.decks-${process.pid}-${Date.now()}.tmp`)
    await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, stateFile)
  })
  return stateWrite
}

function sendLiveUnavailable(response) {
  response.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '2' })
  response.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>簡報切換中</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#0b1020;color:#f5f7ff;font:16px system-ui}.box{max-width:32rem;padding:2rem;text-align:center}a{color:#b7f36b}</style><div class="box"><h1>簡報切換中</h1><p>請稍候幾秒後重新整理。</p><a href="/release">返回公開簡報</a></div></html>')
}

function sendNotFound(response) {
  response.status(404).send('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>找不到頁面</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#080d1a;color:#f4f7ff;font:16px system-ui}.box{padding:2rem;text-align:center}a{color:#b7f36b}</style><div class="box"><h1>找不到這份簡報</h1><p>它可能尚未公開，或連結已失效。</p><a href="/release">查看公開簡報</a></div></html>')
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

async function exists(target) {
  try {
    await access(target)
    return true
  }
  catch {
    return false
  }
}
