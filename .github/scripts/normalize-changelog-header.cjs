#!/usr/bin/env node

const child_process = require('node:child_process')
const fs = require('node:fs')

const changelogPath = 'CHANGELOG.md'

function normalizeChangelogHeader(content) {
  const headerStart = content.indexOf('# Changelog\n')
  if (headerStart <= 0) {
    return content
  }

  const nextSectionStart = content.indexOf('\n## ', headerStart + 1)
  const headerBlock = (nextSectionStart === -1 ? content.slice(headerStart) : content.slice(headerStart, nextSectionStart)).trim()
  const prependedEntries = content.slice(0, headerStart).trim()
  const remainingEntries = (nextSectionStart === -1 ? '' : content.slice(nextSectionStart)).trim()

  return [headerBlock, prependedEntries, remainingEntries].filter(Boolean).join('\n\n') + '\n'
}

function getRepoUrl() {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    let url = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url) || ''
    url = url.replace(/^git\+/, '').replace(/\.git$/, '')
    if (url.startsWith('https://')) return url
  } catch {}
  try {
    const remote = child_process.execSync('git remote get-url origin').toString().trim()
    return remote.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/')
  } catch {}
  return ''
}

function getPreviousTag() {
  try {
    const tags = child_process
      .execSync('git tag --sort=-version:refname')
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
    return tags[0] || ''
  } catch {
    return ''
  }
}

function appendFullChangelogLink(content, currentTag, repoUrl) {
  const prefix = `**Full Changelog**: ${repoUrl}/compare/`
  // Find the bounds of the first release section (the newly generated one)
  const firstSectionStart = content.indexOf('\n## ')
  if (firstSectionStart === -1) return content
  const firstSectionEnd = content.indexOf('\n## ', firstSectionStart + 1)
  const firstSection = firstSectionEnd === -1 ? content.slice(firstSectionStart) : content.slice(firstSectionStart, firstSectionEnd)

  // Skip if a Full Changelog link is already present in that section
  if (firstSection.includes(prefix)) return content

  const prevTag = getPreviousTag()
  if (!prevTag) return content

  const link = `**Full Changelog**: ${repoUrl}/compare/${prevTag}...${currentTag}`
  if (firstSectionEnd === -1) {
    return content.trimEnd() + '\n\n' + link + '\n'
  }
  return content.slice(0, firstSectionEnd).trimEnd() + '\n\n' + link + '\n' + content.slice(firstSectionEnd)
}

exports.preCommit = (props) => {
  if (!fs.existsSync(changelogPath)) {
    return
  }

  let content = fs.readFileSync(changelogPath, 'utf8')
  content = normalizeChangelogHeader(content)

  const repoUrl = getRepoUrl()
  const currentTag = props?.tag || ''
  if (repoUrl && currentTag) {
    content = appendFullChangelogLink(content, currentTag, repoUrl)
  }

  fs.writeFileSync(changelogPath, content)
}