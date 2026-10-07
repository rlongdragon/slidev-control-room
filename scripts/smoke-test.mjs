import assert from 'node:assert/strict'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100'
const password = process.env.TEST_ADMIN_PASSWORD || 'test-password'
let cookie = ''
let shouldRepublish = false

try {
  assert.equal((await fetch(`${base}/`)).url, `${base}/release`)

  const releasePage = await fetch(`${base}/release`)
  assert.equal(releasePage.status, 200)
  const releaseHtml = await releasePage.text()
  assert.match(releaseHtml, /id="release-grid"/)
  assert.doesNotMatch(releaseHtml, /簡報收藏|PRESENTATION ARCHIVE|管理登入/)

  const releases = await json('/api/releases')
  assert.ok(releases.decks.some(deck => deck.slug === 'welcome'))

  const protectedResponse = await fetch(`${base}/api/admin/decks`)
  assert.equal(protectedResponse.status, 401)

  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'incorrect-password' }),
  })
  assert.equal(badLogin.status, 401)

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  assert.equal(login.status, 200)
  cookie = login.headers.get('set-cookie')?.split(';', 1)[0] || ''
  assert.match(cookie, /^slidev_session=/)

  const admin = await json('/api/admin/decks', {}, true)
  const welcome = admin.decks.find(deck => deck.slug === 'welcome')
  assert.ok(welcome)
  assert.equal(welcome.previewAvailable, true)

  const injection = await fetch(`${base}/api/admin/live/${encodeURIComponent('welcome;touch-pwned')}/start`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  assert.equal(injection.status, 400)

  await json('/api/admin/decks/welcome/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ published: false }),
  }, true)
  shouldRepublish = true
  assert.equal((await fetch(`${base}/slide/welcome/`)).status, 404)
  assert.ok(!(await json('/api/releases')).decks.some(deck => deck.slug === 'welcome'))

  await json('/api/admin/decks/welcome/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ published: true }),
  }, true)
  shouldRepublish = false
  const staticDeck = await fetch(`${base}/slide/welcome/`)
  assert.equal(staticDeck.status, 200)
  assert.match(await staticDeck.text(), /slide-live-bridge\.js/)

  const started = await json('/api/admin/live/welcome/start', { method: 'POST' }, true)
  assert.match(started.presenterUrl, /^\/slide\/welcome\/presenter\/\?password=/)
  const livePage = await fetch(`${base}/slide/welcome/`)
  assert.equal(livePage.status, 200)
  assert.match(await livePage.text(), /Slidev/)
  await assertWebSocket(`${base.replace(/^http/, 'ws')}/slide/welcome/`)

  await json('/api/admin/live/stop', { method: 'POST' }, true)
  assert.equal((await json('/api/admin/decks', {}, true)).live.state, 'idle')

  console.log('Smoke test passed: public routes, auth, publication, injection guard, and Live switching.')
}
finally {
  if (cookie) {
    if (shouldRepublish) {
      await json('/api/admin/decks/welcome/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: true }),
      }, true).catch(() => {})
    }
    await json('/api/admin/live/stop', { method: 'POST' }, true).catch(() => {})
  }
}

async function json(path, options = {}, authenticated = false) {
  const headers = new Headers(options.headers || {})
  if (authenticated)
    headers.set('Cookie', cookie)
  const response = await fetch(`${base}${path}`, { ...options, headers })
  const payload = await response.json().catch(() => ({}))
  assert.ok(response.ok, `${path}: ${response.status} ${payload.error || ''}`)
  return payload
}

function assertWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, 'vite-hmr')
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('Live WebSocket proxy timed out.'))
    }, 3_000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      socket.close()
      resolve()
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('Live WebSocket proxy failed.'))
    })
  })
}
