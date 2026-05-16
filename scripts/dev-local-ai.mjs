import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const chronosDir = path.join(root, 'services', 'chronos-bolt')
const venvDir = path.join(chronosDir, '.venv')
const binDir = path.join(venvDir, 'bin')
const pythonBin = path.join(binDir, 'python')
const pipBin = path.join(binDir, 'pip')
const uvicornBin = path.join(binDir, 'uvicorn')
const token = process.env.LOCAL_CHRONOS_TOKEN || 'local-chronos-token'
const chronosPort = Number(process.env.LOCAL_CHRONOS_PORT || '8000')
const serverPort = Number(process.env.PORT || '8787')
const chronosBaseUrl = `http://127.0.0.1:${chronosPort}`

const children = new Set()

async function main() {
  await ensureChronosRuntime()
  const chronos = start('chronos', uvicornBin, ['app:app', '--host', '127.0.0.1', '--port', String(chronosPort)], {
    cwd: chronosDir,
    env: {
      ...process.env,
      CHRONOS_SERVICE_TOKEN: token,
      CHRONOS_MODEL_ID: process.env.CHRONOS_MODEL_ID || 'amazon/chronos-bolt-base',
      CHRONOS_DEVICE: process.env.CHRONOS_DEVICE || 'cpu',
      CHRONOS_TORCH_DTYPE: process.env.CHRONOS_TORCH_DTYPE || 'float32',
      CHRONOS_REQUIRE_MODEL: '1',
      CHRONOS_ENABLE_FALLBACK: '0',
    },
  })

  await waitForChronosReady()

  start('server', 'npm', ['run', 'dev', '--workspace', 'server'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(serverPort),
      EXTERNAL_TS_MODEL_URL: `${chronosBaseUrl}/forecast`,
      EXTERNAL_TS_MODEL_TOKEN: token,
      EXTERNAL_TS_MODEL_PROVIDER: 'chronos',
      EXTERNAL_TS_MODEL_NAME: process.env.CHRONOS_MODEL_ID || 'amazon/chronos-bolt-base',
      EXTERNAL_TS_MODEL_TIMEOUT_MS: '12000',
      EXTERNAL_TS_MODEL_HORIZON_MINUTES: '60',
      EXTERNAL_TS_MODEL_CONTEXT_POINTS: '256',
    },
  })

  start('web', 'npm', ['run', 'dev', '--workspace', 'web', '--', '--host', '127.0.0.1'], {
    cwd: root,
    env: process.env,
  })

  console.log('')
  console.log('Local AI stack is running with real Chronos required.')
  console.log(`Chronos health: ${chronosBaseUrl}/health`)
  console.log(`Server: http://127.0.0.1:${serverPort}`)
  console.log('Web: check the Vite URL printed above, usually http://127.0.0.1:5173')
  console.log('Press Ctrl+C to stop all processes.')

  chronos.on('exit', (code) => {
    if (code !== 0) {
      console.error(`chronos exited with code ${code}`)
      shutdown(1)
    }
  })
}

async function ensureChronosRuntime() {
  if (!existsSync(chronosDir)) {
    throw new Error(`Missing Chronos service directory: ${chronosDir}`)
  }
  if (!existsSync(pythonBin)) {
    console.log('Creating Python venv for Chronos...')
    await runOnce('python3', ['-m', 'venv', '.venv'], { cwd: chronosDir })
  }

  console.log('Installing/updating Chronos dependencies...')
  await runOnce(pipBin, ['install', '--upgrade', 'pip'], { cwd: chronosDir })
  await runOnce(pipBin, ['install', '-r', 'requirements.txt'], { cwd: chronosDir })
}

async function waitForChronosReady() {
  console.log('Waiting for real Chronos-Bolt model to load...')
  const deadline = Date.now() + Number(process.env.LOCAL_CHRONOS_READY_TIMEOUT_MS || '300000')
  let lastError = ''

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${chronosBaseUrl}/health`)
      if (response.ok) {
        const health = await response.json()
        if (health.chronosLoaded === true) {
          console.log('Chronos-Bolt loaded successfully.')
          return
        }
        lastError = JSON.stringify(health)
      } else {
        lastError = `HTTP ${response.status}: ${await response.text()}`
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(3000)
  }

  throw new Error(`Chronos-Bolt did not become ready with chronosLoaded=true. Last error: ${lastError}`)
}

function start(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.stdout.on('data', (chunk) => process.stdout.write(prefix(name, chunk)))
  child.stderr.on('data', (chunk) => process.stderr.write(prefix(name, chunk)))
  child.on('exit', () => children.delete(child))
  return child
}

function runOnce(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })
}

function prefix(name, chunk) {
  return String(chunk)
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => `[${name}] ${line}\n`)
    .join('')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown(code = 0) {
  for (const child of children) {
    child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  shutdown(1)
})
