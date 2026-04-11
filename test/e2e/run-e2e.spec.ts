import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, it } from 'vitest'

const execFileP = promisify(execFile)

describe('e2e scripts (manual-run harness)', () => {
  if (!process.env.RUN_E2E) {
    it.skip('e2e disabled - set RUN_E2E=true to enable', () => {})
    return
  }

  it('should run configured e2e scripts sequentially', async () => {
    const repoRoot = path.resolve(__dirname, '../../')
    const scriptsDir = path.join(repoRoot, 'scripts', 'e2e')

    const scriptsToRun: { envVar: string, script: string }[] = [
      { envVar: 'LIGHT_ACCESSORY_ID', script: 'light-e2e.sh' },
      { envVar: 'FAN_ACCESSORY_ID', script: 'fan-e2e.sh' },
      { envVar: 'CURTAIN_ACCESSORY_ID', script: 'curtain-e2e.sh' },
      { envVar: 'LOCK_ACCESSORY_ID', script: 'lock-e2e.sh' },
    ]

    const logger = console
    for (const s of scriptsToRun) {
      if (!process.env[s.envVar]) {
        logger.info(`Skipping ${s.script} because ${s.envVar} not set`)
        continue
      }

      const scriptPath = path.join(scriptsDir, s.script)
      const env = { ...process.env }

      try {
        logger.info(`Running ${s.script}...`)
        const { stdout, stderr } = await execFileP('bash', [scriptPath], { env })
        logger.info(stdout)
        if (stderr) {
          logger.error(stderr)
        }
      } catch (e: any) {
        logger.error(`Script ${s.script} failed: ${e.message}`)
        throw new Error(`Script ${s.script} failed: ${e.message}`)
      }
    }
  })
})
