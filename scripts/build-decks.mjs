import { spawn } from 'node:child_process'
import { access, copyFile, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const decksRoot = path.join(root, 'decks')
const outputRoot = path.join(root, 'dist', 'slides')
const thumbnailRoot = path.join(root, 'dist', 'thumbnails')
const thumbnailWorkRoot = path.join(root, 'dist', '.thumbnail-work')
const slidevBin = path.join(root, 'node_modules', '@slidev', 'cli', 'bin', 'slidev.mjs')

await access(slidevBin)
await mkdir(outputRoot, { recursive: true })
await mkdir(thumbnailRoot, { recursive: true })

const entries = await readdir(decksRoot, { withFileTypes: true })
const slugs = []

for (const entry of entries) {
  if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name))
    continue

  const source = path.join(decksRoot, entry.name, 'slides.md')
  try {
    await access(source)
    slugs.push(entry.name)
  }
  catch {}
}

if (slugs.length === 0) {
  console.log('沒有找到 decks/<slug>/slides.md。')
  process.exit(0)
}

for (const [index, slug] of slugs.sort().entries()) {
  const source = path.join(decksRoot, slug, 'slides.md')
  const output = path.join(outputRoot, slug)
  console.log(`[${index + 1}/${slugs.length}] Building ${slug}`)
  await ensureLocalNodeModules(path.dirname(source))
  await secureDeckModes(source)
  await ensureViteConfig(path.dirname(source))
  await rm(output, { recursive: true, force: true })

  await run(process.execPath, [
    slidevBin,
    'build',
    source,
    '--base', './',
    '--out', output,
    '--router-mode', 'hash',
    '--without-notes',
  ], root)
  await addLiveBridge(path.join(output, 'index.html'), slug)
  await generateThumbnail(source, slug)
}

await rm(thumbnailWorkRoot, { recursive: true, force: true })

console.log(`完成：${slugs.length} 份簡報已輸出到 dist/slides。`)

async function ensureViteConfig(deckRoot) {
  const names = ['vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.ts', 'vite.config.mts', 'vite.config.cts']
  for (const name of names) {
    try {
      await access(path.join(deckRoot, name))
      return
    }
    catch {}
  }

  await writeFile(
    path.join(deckRoot, 'vite.config.mjs'),
    "export { default } from '../../vite.config.mjs'\n",
    { encoding: 'utf8', flag: 'wx' },
  )
}

async function ensureLocalNodeModules(deckRoot) {
  const target = path.join(deckRoot, 'node_modules')
  try {
    await lstat(target)
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
    await symlink('../../node_modules', target, 'dir')
  }
}

async function secureDeckModes(source) {
  const markdown = await readFile(source, 'utf8')
  const headmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!headmatter)
    throw new Error(`${source} 必須包含 headmatter，才能安全停用公開 Presenter。`)

  let securedBody = headmatter[1]
  securedBody = setHeadmatterValue(securedBody, 'presenter', 'dev')
  securedBody = setHeadmatterValue(securedBody, 'browserExporter', 'true')
  securedBody = setHeadmatterValue(securedBody, 'editor', 'false')
  securedBody = setHeadmatterValue(securedBody, 'mcp', 'false')
  const secured = markdown.replace(headmatter[0], `---\n${securedBody}\n---`)
  if (secured !== markdown)
    await writeFile(source, secured, 'utf8')
}

function setHeadmatterValue(body, key, value) {
  const pattern = new RegExp(`^${key}\\s*:.*$`, 'm')
  return pattern.test(body)
    ? body.replace(pattern, `${key}: ${value}`)
    : `${body}\n${key}: ${value}`
}

async function addLiveBridge(indexPath, slug) {
  const html = await readFile(indexPath, 'utf8')
  const script = `<script type="module" src="/slide-live-bridge.js?deck=${slug}"></script>`
  if (!html.includes('/slide-live-bridge.js'))
    await writeFile(indexPath, html.replace('</body>', `${script}</body>`), 'utf8')
}

async function generateThumbnail(source, slug) {
  const work = path.join(thumbnailWorkRoot, slug)
  await rm(work, { recursive: true, force: true })
  await run(process.execPath, [
    slidevBin,
    'export',
    source,
    '--format', 'png',
    '--range', '1',
    '--output', work,
    '--timeout', '30000',
    '--wait-until', 'networkidle',
  ], root)
  await copyFile(path.join(work, '1.png'), path.join(thumbnailRoot, `${slug}.png`))
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, BROWSER: 'none' },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0)
        resolve()
      else
        reject(new Error(`Build failed with exit code ${code}`))
    })
  })
}
