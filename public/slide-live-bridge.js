const scriptUrl = new URL(import.meta.url)
const deck = scriptUrl.searchParams.get('deck') || deckFromPath(window.location.pathname)
const mode = scriptUrl.searchParams.get('mode')
const privateHashRoute = /^#\/(?:presenter|notes|notes-edit|overview|entry|print)(?:\/|$)/.test(window.location.hash)
const numberedHashRoute = window.location.hash.match(/^#\/(\d+)(?:\/)?$/)
const isExportPath = window.location.pathname.startsWith('/export/')

if (privateHashRoute)
  window.location.replace('/release')
else if (mode === 'live') {
  if (deck && numberedHashRoute)
    window.location.replace(`/slide/${encodeURIComponent(deck)}/${numberedHashRoute[1]}`)
}
else if (deck && !isExportPath)
  window.setInterval(checkLiveState, 3_000)

function deckFromPath(pathname) {
  const match = pathname.match(/^\/slide\/([^/]+)(?:\/|$)/)
  if (!match)
    return null
  try {
    return decodeURIComponent(match[1])
  }
  catch {
    return null
  }
}

async function checkLiveState() {
  try {
    const response = await fetch('/api/releases', { cache: 'no-store' })
    if (!response.ok)
      return
    const data = await response.json()
    if (data.live?.state === 'running' && data.live.deck?.slug === deck)
      window.location.reload()
  }
  catch {}
}
