import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.env.NPM_CLI_PATH ?? resolve(dirname(process.execPath), 'npm')
const args = new Set(process.argv.slice(2))
const port = Number(process.env.PORT ?? process.env.LOCAL_PREVIEW_PORT ?? '8789')
const healthUrl = `http://localhost:${port}/api/snapshot`
const pageUrl = `http://localhost:${port}/?codexV4=1`
const skipBuild = args.has('--skip-build')
const once = args.has('--once')
const daemonMode = args.has('--daemon')

let child = null
let stopping = false

function log(message) {
  console.log(`[gold-preview ${new Date().toISOString()}] ${message}`)
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function isHealthy(timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(healthUrl, { signal: controller.signal })
    if (!response.ok) {
      return false
    }
    const payload = await response.json()
    return Boolean(payload?.success !== false)
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function isPageHealthy(timeoutMs = 3000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(pageUrl, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForPageHealthy() {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    if (await isPageHealthy()) {
      return true
    }
    await sleep(500)
  }
  return false
}

function keepDaemonAlive() {
  if (!daemonMode) {
    return
  }
  setInterval(async () => {
    if (!child && !(await isPageHealthy())) {
      log('page health check failed while daemon is alive; starting server')
      startServer()
      await waitForPageHealthy()
    }
  }, 30_000)
}

function runBuildIfNeeded() {
  if (skipBuild) {
    log('skip build requested')
    return
  }
  log('building server and web assets')
  const result = spawnSync(npmCommand, ['run', 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`build failed with exit code ${result.status}`)
  }
}

function startServer() {
  log(`starting local preview on ${pageUrl}`)
  child = spawn(npmCommand, ['run', 'start'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
    },
  })

  child.on('exit', async (code, signal) => {
    child = null
    if (stopping || once) {
      log(`server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      return
    }
    log(`server exited code=${code ?? 'null'} signal=${signal ?? 'null'}; restarting in 2s`)
    await sleep(2000)
    startServer()
  })

  child.on('error', async (error) => {
    log(`failed to start server: ${error instanceof Error ? error.message : String(error)}`)
    child = null
    if (!stopping && !once) {
      await sleep(5000)
      startServer()
    }
  })
}

function stop() {
  stopping = true
  if (child) {
    child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(0), 250).unref()
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

mkdirSync(resolve(rootDir, '.local-preview'), { recursive: true })

if (!daemonMode && await isPageHealthy(3000)) {
  log(`already healthy: ${pageUrl}`)
  process.exit(0)
} else {
  runBuildIfNeeded()
  startServer()

  if (await waitForPageHealthy()) {
    log(`page healthy: ${pageUrl}`)
  } else {
    log(`warning: server started but page health check did not pass yet: ${pageUrl}`)
  }

  if (await isHealthy()) {
    log(`snapshot healthy: ${healthUrl}`)
  } else {
    log(`warning: page is reachable, but snapshot health is still warming up: ${healthUrl}`)
  }

  if (once) {
    process.exit((await isPageHealthy()) ? 0 : 1)
  }

  keepDaemonAlive()
}
