#!/usr/bin/env node

import fs from 'node:fs'
import https from 'node:https'
import process from 'node:process'

const allowed = new Set(['major', 'minor', 'patch'])

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
  }
  console.log(`${name}=${value}`)
}

function resolveFromLabels(labels) {
  const majorLabels = new Set(['major', 'semver:major', 'release:major', 'breaking', 'breaking-change'])
  const minorLabels = new Set(['minor', 'semver:minor', 'release:minor', 'feature'])
  const patchLabels = new Set(['patch', 'semver:patch', 'release:patch', 'fix'])

  if (labels.some(label => majorLabels.has(label))) return 'major'
  if (labels.some(label => minorLabels.has(label))) return 'minor'
  if (labels.some(label => patchLabels.has(label))) return 'patch'
  return 'patch'
}

function listPrsForCommit(owner, repo, sha, token) {
  return new Promise((resolve, reject) => {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}/pulls`
    const req = https.request(
      {
        hostname: 'api.github.com',
        method: 'GET',
        path,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'homebridge-resolve-version-bump',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API request failed (${res.statusCode}): ${body}`))
            return
          }
          try {
            const parsed = JSON.parse(body)
            resolve(Array.isArray(parsed) ? parsed : [])
          } catch (error) {
            reject(new Error(`Failed to parse GitHub API response: ${error.message}`))
          }
        })
      },
    )

    req.on('error', reject)
    req.end()
  })
}

async function main() {
  const manualInput = (process.argv[2] || '').trim().toLowerCase()
  if (manualInput) {
    if (!allowed.has(manualInput)) {
      console.error(`Invalid version bump '${manualInput}'. Use major, minor, or patch.`)
      process.exit(1)
    }
    console.error(`Using manual version bump input: ${manualInput}`)
    setOutput('version_bump', manualInput)
    return
  }

  const repository = process.env.GITHUB_REPOSITORY || ''
  const sha = process.env.GITHUB_SHA || ''
  const token = process.env.GITHUB_TOKEN || ''

  if (!repository || !sha || !token || !repository.includes('/')) {
    console.error('Missing GITHUB_REPOSITORY, GITHUB_SHA, or GITHUB_TOKEN. Defaulting to patch.')
    setOutput('version_bump', 'patch')
    return
  }

  const [owner, repo] = repository.split('/')

  try {
    const prs = await listPrsForCommit(owner, repo, sha, token)
    const pr = prs.find((candidate) => candidate.merged_at) || prs[0]

    if (!pr) {
      console.error('No PR associated with commit; defaulting to patch.')
      setOutput('version_bump', 'patch')
      return
    }

    const labels = (pr.labels || [])
      .map((label) => (typeof label === 'string' ? label : label.name || ''))
      .map((label) => label.toLowerCase())

    const bump = resolveFromLabels(labels)
    console.error(`Resolved bump '${bump}' from PR #${pr.number} labels: ${labels.join(', ') || '(none)'}`)
    setOutput('version_bump', bump)
  } catch (error) {
    console.error(`Failed to inspect PR labels, defaulting to patch: ${error.message}`)
    setOutput('version_bump', 'patch')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})