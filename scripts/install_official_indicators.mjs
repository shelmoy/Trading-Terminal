/**
 * Install the pinned official chart library through the chart-indicator gate.
 * Run from either OpenAlgo checkout: node scripts/install_official_indicators.mjs
 * No network fetch, service restart, credential access or chart activation.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = join(root, 'vendor', 'openalgo-js-indicator-library')
const destination = join(root, 'strategies', 'indicators')
const validator = join(root, '.claude', 'skills', 'chart-indicator', 'validate.mjs')
const manifest = JSON.parse(readFileSync(join(vendor, 'manifest.json'), 'utf8'))
const digest = (path) => createHash('sha256')
  .update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
const safeName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\.js$/

async function main() {
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== manifest.count) {
    throw new Error('The library manifest is incomplete.')
  }
  const files = new Set()
  const ids = new Set()
  const pending = []
  for (const entry of manifest.entries) {
    const source = resolve(vendor, entry.path)
    if (!source.startsWith(`${vendor}${sep}`) || !safeName.test(entry.file) ||
        files.has(entry.file) || typeof entry.id !== 'string' || ids.has(entry.id)) {
      throw new Error(`Unsafe or duplicate library entry: ${entry.file}`)
    }
    files.add(entry.file)
    ids.add(entry.id)
    if (digest(source) !== entry.sha256) throw new Error(`Source changed: ${entry.file}`)
    const installed = join(destination, entry.file)
    if (existsSync(installed)) {
      if (digest(installed) !== entry.sha256) {
        throw new Error(`Preserving a different existing file: ${installed}. Reconcile it before installing.`)
      }
    } else pending.push({ ...entry, source })
  }

  // Check all literal ids, including those in alerts. A conservative refusal is
  // preferable to an official module shadowing an existing personal study.
  if (existsSync(destination)) {
    for (const file of readdirSync(destination).filter((file) => file.endsWith('.js') && !files.has(file))) {
      const source = readFileSync(join(destination, file), 'utf8')
      for (const match of source.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)) {
        if (ids.has(match[1])) throw new Error(`Preserving id ${match[1]} in existing ${file}.`)
      }
    }
  }

  if (pending.length === 0) {
    console.log(`All ${manifest.count} official indicators are already installed and match the pinned source.`)
    return
  }
  if (!existsSync(join(root, 'frontend', 'node_modules', 'openalgo-charts', 'dist', 'openalgo-charts.mjs'))) {
    throw new Error('The pinned frontend chart dependency must be installed before validating. No packages were downloaded.')
  }

  const results = []
  let next = 0
  const runGate = (entry, install) => new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [validator, entry.source, ...(install ? ['--install'] : [])], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolveResult({ file: entry.file, phase: install ? 'install' : 'validate', code, output }))
  })
  const processAll = async (install) => {
    next = 0
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < pending.length) {
        const entry = pending[next++]
        const result = await runGate(entry, install)
        results.push(result)
        if (result.code !== 0) console.error(`Failed ${result.phase}: ${entry.file}`)
      }
    }))
  }

  // All candidates pass before any file is installed. --install runs the same
  // unmodified validator again; it is the only code that writes live modules.
  await processAll(false)
  if (results.every((result) => result.code === 0)) await processAll(true)
  mkdirSync(join(root, 'tmp'), { recursive: true })
  const report = join(root, 'tmp', 'official-indicator-install.json')
  writeFileSync(report, `${JSON.stringify({ commit: manifest.commit, chartsVersion: manifest.chartsVersion, results }, null, 2)}\n`)
  const failures = results.filter((result) => result.code !== 0)
  if (failures.length) throw new Error(`${failures.length} validation/install failure(s). Details: ${report}`)
  for (const entry of manifest.entries) {
    if (digest(join(destination, entry.file)) !== entry.sha256) throw new Error(`Installed hash mismatch: ${entry.file}`)
  }
  const warnings = results.filter((result) => result.phase === 'validate')
    .flatMap((result) => result.output.split(/\r?\n/).filter((line) => line.includes('  WARNING')))
  console.log(`Installed ${pending.length}; ${manifest.count} official indicators available. Reopen Trading > Indicators.`)
  console.log(`${warnings.length} validator warning(s); details: ${report}`)
  console.log('Upstream limitations and the recorded warning list are under vendor/openalgo-js-indicator-library/.')
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 })
