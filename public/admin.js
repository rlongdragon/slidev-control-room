const elements = {
  adminView: document.querySelector('#admin-view'),
  audienceButton: document.querySelector('#audience-button'),
  deckCount: document.querySelector('#deck-count'),
  deckGrid: document.querySelector('#deck-grid'),
  deckTemplate: document.querySelector('#deck-template'),
  liveDescription: document.querySelector('#live-description'),
  liveTitle: document.querySelector('#live-title'),
  loginError: document.querySelector('#login-error'),
  loginForm: document.querySelector('#login-form'),
  loginView: document.querySelector('#login-view'),
  logoutButton: document.querySelector('#logout-button'),
  notice: document.querySelector('#notice'),
  password: document.querySelector('#password'),
  refreshButton: document.querySelector('#refresh-button'),
  statusDot: document.querySelector('#status-dot'),
  statusLabel: document.querySelector('#status-label'),
  stopButton: document.querySelector('#stop-button'),
}

let currentLive = null
let refreshTimer = null

elements.loginForm.addEventListener('submit', login)
elements.logoutButton.addEventListener('click', logout)
elements.refreshButton.addEventListener('click', () => loadDecks(true))
elements.stopButton.addEventListener('click', stopPresentation)
elements.audienceButton.addEventListener('click', (event) => {
  if (elements.audienceButton.getAttribute('aria-disabled') === 'true')
    event.preventDefault()
})

initialize()

async function initialize() {
  try {
    const response = await fetch('/api/auth', { cache: 'no-store' })
    const data = await response.json()
    if (data.authenticated)
      showAdmin()
    else
      showLogin()
  }
  catch {
    showLogin('目前無法連線到管理服務。')
  }
}

async function login(event) {
  event.preventDefault()
  const submit = elements.loginForm.querySelector('button[type="submit"]')
  submit.disabled = true
  hideLoginError()

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: elements.password.value }),
    })
    const data = await response.json()
    if (!response.ok)
      throw new Error(data.error || '登入失敗。')
    elements.password.value = ''
    showAdmin()
  }
  catch (error) {
    showLoginError(error.message)
  }
  finally {
    submit.disabled = false
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
  showLogin()
}

function showLogin(message = '') {
  window.clearInterval(refreshTimer)
  refreshTimer = null
  elements.adminView.classList.add('is-hidden')
  elements.loginView.classList.remove('is-hidden')
  if (message)
    showLoginError(message)
  elements.password.focus()
}

function showAdmin() {
  elements.loginView.classList.add('is-hidden')
  elements.adminView.classList.remove('is-hidden')
  loadDecks()
  window.clearInterval(refreshTimer)
  refreshTimer = window.setInterval(() => loadDecks(false, true), 8_000)
}

async function loadDecks(showSpinner = false, quiet = false) {
  if (showSpinner)
    elements.refreshButton.classList.add('is-loading')
  try {
    const response = await fetch('/api/admin/decks', { cache: 'no-store' })
    if (response.status === 401) {
      showLogin('登入已過期，請重新登入。')
      return
    }
    if (!response.ok)
      throw new Error('無法讀取簡報清單。')
    const data = await response.json()
    currentLive = data.live
    renderLive(data.live)
    renderDecks(data.decks)
    hideNotice()
  }
  catch (error) {
    if (!quiet)
      showNotice(error.message)
  }
  finally {
    elements.refreshButton.classList.remove('is-loading')
  }
}

function renderLive(live) {
  elements.statusDot.className = 'status-dot'
  elements.stopButton.classList.toggle('is-hidden', live.state === 'idle')
  if (live.state === 'running' && live.deck) {
    elements.statusDot.classList.add('is-live')
    elements.statusLabel.textContent = 'Live'
    elements.liveTitle.textContent = live.deck.title
    elements.liveDescription.textContent = `目前正在播放 ${live.deck.title}，公開連結已接上同步畫面。`
    elements.audienceButton.href = live.audienceUrl
    elements.audienceButton.classList.remove('is-disabled')
    elements.audienceButton.setAttribute('aria-disabled', 'false')
    return
  }
  if (live.state === 'starting') {
    elements.statusDot.classList.add('is-starting')
    elements.statusLabel.textContent = 'Starting'
    elements.liveTitle.textContent = live.deck?.title || '正在啟動簡報'
    elements.liveDescription.textContent = 'Slidev 正在準備 Presenter 與觀眾畫面。'
  }
  else if (live.state === 'error') {
    elements.statusDot.classList.add('is-error')
    elements.statusLabel.textContent = 'Error'
    elements.liveTitle.textContent = '簡報啟動失敗'
    elements.liveDescription.textContent = live.message || '請重新選擇簡報再試一次。'
  }
  else {
    elements.statusLabel.textContent = 'Standby'
    elements.liveTitle.textContent = '目前沒有 Live 簡報'
    elements.liveDescription.textContent = '選擇已公開的簡報開始，公開連結會切換成同步的觀眾畫面。'
  }
  elements.audienceButton.classList.add('is-disabled')
  elements.audienceButton.setAttribute('aria-disabled', 'true')
}

function renderDecks(decks) {
  elements.deckGrid.replaceChildren()
  elements.deckCount.textContent = `${decks.length} 份簡報`
  if (decks.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<h3>還沒有簡報</h3><p>新增 decks/&lt;名稱&gt;/slides.md 後重新整理。</p>'
    elements.deckGrid.append(empty)
    return
  }

  decks.forEach((deck) => {
    const card = elements.deckTemplate.content.firstElementChild.cloneNode(true)
    card.classList.toggle('is-live', deck.isLive)
    card.querySelector('.live-badge').classList.toggle('is-hidden', !deck.isLive)
    card.querySelector('.deck-title').textContent = deck.title
    card.querySelector('.deck-description').textContent = deck.description
    card.querySelector('.publication-hint').textContent = deck.isPublished ? '出現在 /release' : '只有登入後可看'
    card.querySelector('.deck-meta').textContent = `更新於 ${formatDate(deck.updatedAt)}`

    const toggle = card.querySelector('.publish-toggle')
    toggle.checked = deck.isPublished
    toggle.setAttribute('aria-label', `${deck.isPublished ? '取消公開' : '公開'} ${deck.title}`)
    toggle.addEventListener('change', () => setPublished(deck, toggle))

    const preview = card.querySelector('.preview-button')
    preview.href = deck.publicUrl
    if (!deck.previewAvailable) {
      preview.classList.add('is-disabled')
      preview.setAttribute('aria-disabled', 'true')
      preview.title = '請先執行 npm run build'
    }

    const startButton = card.querySelector('.start-button')
    startButton.textContent = deck.isLive ? '進入 Presenter' : currentLive?.state === 'running' ? '切換並開始' : '開始簡報'
    startButton.disabled = !deck.isPublished || !deck.previewAvailable
    startButton.title = !deck.isPublished ? '請先公開這份簡報' : !deck.previewAvailable ? '請先執行 npm run build' : ''
    startButton.addEventListener('click', () => startPresentation(deck, startButton))
    elements.deckGrid.append(card)
  })
}

async function setPublished(deck, toggle) {
  toggle.disabled = true
  hideNotice()
  try {
    await apiRequest(`/api/admin/decks/${encodeURIComponent(deck.slug)}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: toggle.checked }),
    })
    await loadDecks(false, true)
  }
  catch (error) {
    toggle.checked = !toggle.checked
    showNotice(error.message)
  }
  finally {
    toggle.disabled = false
  }
}

async function startPresentation(deck, button) {
  hideNotice()
  button.disabled = true
  button.classList.add('is-loading')
  try {
    const data = await apiRequest(`/api/admin/live/${encodeURIComponent(deck.slug)}/start`, { method: 'POST' })
    window.location.assign(data.presenterUrl)
  }
  catch (error) {
    showNotice(error.message)
    button.disabled = false
    button.classList.remove('is-loading')
    await loadDecks(false, true)
  }
}

async function stopPresentation() {
  hideNotice()
  elements.stopButton.disabled = true
  elements.stopButton.textContent = '停止中…'
  try {
    await apiRequest('/api/admin/live/stop', { method: 'POST' })
    await loadDecks()
  }
  catch (error) {
    showNotice(error.message)
  }
  finally {
    elements.stopButton.disabled = false
    elements.stopButton.textContent = '停止簡報'
  }
}

async function apiRequest(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) {
    showLogin('登入已過期，請重新登入。')
    throw new Error('請重新登入。')
  }
  if (!response.ok)
    throw new Error(data.error || '操作失敗，請稍後再試。')
  return data
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function showNotice(message) {
  elements.notice.textContent = message
  elements.notice.classList.remove('is-hidden')
}

function hideNotice() {
  elements.notice.textContent = ''
  elements.notice.classList.add('is-hidden')
}

function showLoginError(message) {
  elements.loginError.textContent = message
  elements.loginError.classList.remove('is-hidden')
}

function hideLoginError() {
  elements.loginError.textContent = ''
  elements.loginError.classList.add('is-hidden')
}
