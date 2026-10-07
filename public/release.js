const grid = document.querySelector('#release-grid')
const notice = document.querySelector('#release-notice')
const template = document.querySelector('#release-template')

loadReleases()
window.setInterval(loadReleases, 15_000)

async function loadReleases() {
  try {
    const response = await fetch('/api/releases', { cache: 'no-store' })
    if (!response.ok)
      throw new Error('暫時無法讀取公開簡報。')
    const data = await response.json()
    render(data.decks)
    notice.classList.add('is-hidden')
  }
  catch (error) {
    notice.textContent = error.message
    notice.classList.remove('is-hidden')
  }
}

function render(decks) {
  grid.replaceChildren()
  if (decks.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<h3>目前沒有公開簡報</h3><p>請稍後再回來看看。</p>'
    grid.append(empty)
    return
  }

  decks.forEach((deck) => {
    const card = template.content.firstElementChild.cloneNode(true)
    card.classList.toggle('is-live', deck.isLive)
    card.querySelector('.release-main').href = deck.publicUrl
    const preview = card.querySelector('.release-preview img')
    preview.src = deck.thumbnailUrl
    preview.alt = `${deck.title} 第一頁預覽`
    card.querySelector('.live-badge').classList.toggle('is-hidden', !deck.isLive)
    card.querySelector('.deck-title').textContent = deck.title
    card.querySelector('.deck-description').textContent = deck.description
    const exportLink = card.querySelector('.export-label')
    exportLink.href = deck.exportUrl || `/export/${encodeURIComponent(deck.slug)}/#/export`
    exportLink.setAttribute('aria-label', `匯出 ${deck.title} PDF`)
    const openLink = card.querySelector('.open-label')
    openLink.href = deck.publicUrl
    openLink.textContent = deck.isLive ? '加入 Live' : '開啟簡報'
    grid.append(card)
  })
}
