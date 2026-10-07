import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from 'playwright-chromium'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'docs', 'images')
const base = process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:3000'
const updatedAt = '2026-10-01T08:00:00.000Z'
const decks = [
  deck('demo-product', '產品路線圖', '從使用者需求到季度交付', true),
  deck('demo-engineering', '工程週報', '穩定性、交付進度與下一步'),
  deck('welcome', 'Slidev Control Room', '控制台範例簡報，示範 Presenter 與觀眾同步。'),
]
const live = {
  state: 'running',
  deck: { slug: 'demo-product', title: '產品路線圖' },
  startedAt: updatedAt,
  message: null,
  audienceUrl: '/slide/demo-product/',
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

try {
  await captureRelease()
  await captureAdmin()
}
finally {
  await browser.close()
}

console.log(`Screenshots written to ${path.relative(root, output)}/`)

async function captureRelease() {
  const page = await createPage()
  await page.route('**/api/releases', route => route.fulfill({ json: { decks, live } }))
  await page.goto(`${base}/release`, { waitUntil: 'networkidle' })
  await page.locator('.release-card').first().waitFor()
  await page.screenshot({ path: path.join(output, 'release.png'), fullPage: true })
  await page.close()
}

async function captureAdmin() {
  const page = await createPage()
  await page.route('**/api/auth', route => route.fulfill({ json: { authenticated: true } }))
  await page.route('**/api/admin/decks', route => route.fulfill({ json: { decks, live } }))
  await page.goto(`${base}/slides`, { waitUntil: 'networkidle' })
  await page.locator('#admin-view:not(.is-hidden)').waitFor()
  await page.screenshot({ path: path.join(output, 'admin.png'), fullPage: true })
  await page.close()
}

async function createPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return page
}

function deck(slug, title, description, isLive = false) {
  return {
    slug,
    title,
    description,
    updatedAt,
    previewAvailable: true,
    publicUrl: `/slide/${slug}/`,
    exportUrl: `/export/${slug}/#/export`,
    thumbnailUrl: `/thumbnails/${slug}.png`,
    isPublished: true,
    isLive,
  }
}
