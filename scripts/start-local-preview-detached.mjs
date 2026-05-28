import { spawn } from 'node:child_process'
import { mkdirSync, openSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logDir = resolve(rootDir, '.local-preview')
const outPath = resolve(logDir, 'detached-8789.log')
const errPath = resolve(logDir, 'detached-8789.err.log')
const pidPath = resolve(logDir, 'detached-8789.pid')
const npmCommand = process.env.NPM_CLI_PATH ?? resolve(dirname(process.execPath), 'npm')

mkdirSync(logDir, { recursive: true })

const out = openSync(outPath, 'a')
const err = openSync(errPath, 'a')

const child = spawn(npmCommand, ['run', 'preview:keepalive', '--', '--skip-build', '--daemon'], {
  cwd: rootDir,
  detached: true,
  stdio: ['ignore', out, err],
  env: {
    ...process.env,
    PORT: '8789',
    NODE_ENV: 'production',
  },
})

child.unref()
writeFileSync(pidPath, `${child.pid}\n`)

console.log(`Detached local preview keeper started pid=${child.pid}`)
console.log('Preview URL: http://localhost:8789/?codexV4=1')
console.log(`Logs: ${outPath}`)
