import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const chronosDir = path.join(root, 'services', 'chronos-bolt')
const venvDir = path.join(chronosDir, '.venv')
const pythonBin = path.join(venvDir, 'bin', 'python')
const pipBin = path.join(venvDir, 'bin', 'pip')
const uvicornBin = path.join(venvDir, 'bin', 'uvicorn')
const token = process.env.LOCAL_CHRONOS_TOKEN || 'local-chronos-token'
const port = process.env.LOCAL_CHRONOS_PORT || '8000'

async function main() {
  if (!existsSync(pythonBin)) {
    await run('python3', ['-m', 'venv', '.venv'])
  }
  await run(pipBin, ['install', '--upgrade', 'pip'])
  await run(pipBin, ['install', '-r', 'requirements.txt'])

  const child = spawn(uvicornBin, ['app:app', '--host', '127.0.0.1', '--port', port], {
    cwd: chronosDir,
    stdio: 'inherit',
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
  child.on('exit', (code) => process.exit(code ?? 0))
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: chronosDir,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
