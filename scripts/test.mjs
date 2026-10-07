import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'slidev-control-room-'))
const stateFile = path.join(temporary, 'decks.json')
const port = 31_000
const password = 'smoke-test-password'

await writeFile(stateFile, JSON.stringify({ published: ['welcome'] }))

const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    SLIDEV_PORT: String(port + 1),
    ADMIN_PASSWORD: password,
    SESSION_SECRET: 'smoke-test-session-secret-at-least-32-chars',
    REMOTE_PASSWORD: 'smoke-test-presenter-password',
    COOKIE_SECURE: 'false',
    STATE_FILE: stateFile,
  },
  stdio: 'inherit',
})

try {
  await waitForServer(`http://127.0.0.1:${port}/api/releases`)
  await runSmokeTest(port, password)
}
finally {
  server.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ])
  await rm(temporary, { recursive: true, force: true })
}

async function waitForServer(url) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Server stopped with exit code ${server.exitCode}.`)
    try {
      const response = await fetch(url)
      if (response.ok)
        return
    }
    catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Timed out while starting the smoke-test server.')
}

function runSmokeTest(serverPort, adminPassword) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke-test.mjs'], {
      cwd: root,
      env: {
        ...process.env,
        TEST_BASE_URL: `http://127.0.0.1:${serverPort}`,
        TEST_ADMIN_PASSWORD: adminPassword,
      },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Smoke test failed with exit code ${code}.`)))
  })
}
