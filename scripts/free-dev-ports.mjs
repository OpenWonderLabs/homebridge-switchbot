import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

function resolvePorts() {
  let bridgePort = 51829
  let uiPort = 8581

  try {
    const configPath = resolve(homedir(), '.homebridge-dev', 'config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8'))

    if (typeof config?.bridge?.port === 'number') {
      bridgePort = config.bridge.port
    }

    const configUiPlatform = Array.isArray(config?.platforms)
      ? config.platforms.find(platform => platform?.platform === 'config')
      : undefined

    if (typeof configUiPlatform?.port === 'number') {
      uiPort = configUiPlatform.port
    }
  } catch {}

  return [...new Set([bridgePort, uiPort])]
}

function pidsForPort(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

function freePort(port) {
  const initialPids = pidsForPort(port)
  if (initialPids.length === 0) {
    return
  }

  try {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -TERM`, { stdio: ['ignore', 'ignore', 'ignore'] })
  } catch {}

  const remainingPids = pidsForPort(port)
  if (remainingPids.length > 0) {
    try {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -KILL`, { stdio: ['ignore', 'ignore', 'ignore'] })
    } catch {}
  }
}

function cleanupDevProcesses() {
  let output = ''
  try {
    output = execSync('ps -axo pid=,command=', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch {
    return
  }

  const targetPids = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const firstSpace = line.indexOf(' ')
      if (firstSpace === -1) {
        return null
      }

      const pid = Number(line.slice(0, firstSpace).trim())
      const command = line.slice(firstSpace + 1)
      return Number.isFinite(pid) ? { pid, command } : null
    })
    .filter((entry) => {
      if (!entry) {
        return false
      }

      if (entry.pid === process.pid || entry.pid === process.ppid) {
        return false
      }

      const isNodemonProcess = entry.command.includes('homebridge-switchbot/node_modules/.bin/nodemon')
      const isConfigUiProcess = entry.command.trim().startsWith('homebridge-config-ui-x')
      return isNodemonProcess || isConfigUiProcess
    })
    .map(entry => entry.pid)

  for (const pid of targetPids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
  }
}

cleanupDevProcesses()

for (const port of resolvePorts()) {
  freePort(port)
}
