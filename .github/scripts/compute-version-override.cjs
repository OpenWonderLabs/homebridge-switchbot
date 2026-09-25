#!/usr/bin/env node

const child = require('node:child_process')
const fs = require('node:fs')

const bump = (process.argv[2] || 'patch').toLowerCase()
const allowed = new Set(['major', 'minor', 'patch'])

if (!allowed.has(bump)) {
  console.error(`Invalid bump level '${bump}'. Use major, minor, or patch.`)
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

function inc(v, level) {
  const parts = v.split('-')[0].split('+')[0].split('.').map(Number)
  if (level === 'major') {
    parts[0] += 1
    parts[1] = 0
    parts[2] = 0
  } else if (level === 'minor') {
    parts[1] += 1
    parts[2] = 0
  } else {
    parts[2] += 1
  }
  return parts.join('.')
}

function latestStable(name) {
  try {
    const versions = JSON.parse(child.execSync(`npm info ${name} versions --json`).toString('utf8').trim())
    const stable = (Array.isArray(versions) ? versions : [])
      .filter(v => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/.test(v) && !v.includes('-'))
    stable.sort((a, b) => {
      const ap = a.split('.').map(Number)
      const bp = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        if (ap[i] !== bp[i]) return bp[i] - ap[i]
      }
      return 0
    })
    return stable[0] || ''
  } catch {
    return ''
  }
}

const base = latestStable(pkg.name) || pkg.version
process.stdout.write(inc(base, bump))
