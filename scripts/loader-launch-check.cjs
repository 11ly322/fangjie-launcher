const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')

const root = path.resolve(__dirname, '..')
const home = path.join(root, 'test-artifacts', 'e2e-home')
const artifacts = path.join(root, 'test-artifacts')
const report = { steps: [], failures: [] }

function step(name, data) {
  const entry = { at: new Date().toISOString(), step: name, ...data }
  report.steps.push(entry)
  console.log('STEP', JSON.stringify(entry))
}

async function main() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root],
    cwd: root,
    env: {
      ...env,
      FJ_HOME: home,
      FJ_DATA: path.join(home, 'game'),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    },
    timeout: 60000
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.hero-play', { timeout: 30000 })

  try {
    const snap = await page.evaluate(async () => window.fangjie.snapshot())
    const targets = snap.value.instances.filter((instance) =>
      ['quilt', 'forge', 'neoforge'].includes(instance.loader)
    )
    step('targets', targets.map((instance) => ({ id: instance.id, loader: instance.loader })))

    for (const instance of targets) {
      const gameDir = path.join(home, 'game', 'instances', instance.id, '.minecraft')
      const logPath = path.join(gameDir, 'logs', 'latest.log')
      fs.rmSync(logPath, { force: true })
      const startedAt = Date.now()
      const result = await page.evaluate(
        async ({ id }) => window.fangjie.launchInstance(id),
        { id: instance.id }
      )
      step(`launch-${instance.loader}`, result)
      if (!result.ok) {
        report.failures.push(`${instance.loader} launch request failed: ${result.error}`)
        continue
      }
      const deadline = Date.now() + 90_000
      let log = ''
      let fresh = false
      while (Date.now() < deadline) {
        await page.waitForTimeout(2000)
        if (fs.existsSync(logPath)) {
          const stat = fs.statSync(logPath)
          fresh = stat.mtimeMs >= startedAt - 1000
          log = fs.readFileSync(logPath, 'utf8')
          if (
            fresh &&
            /ModLauncher running|Loading Minecraft .* with .*Loader/i.test(log) &&
            /Created: .*atlas|Sound engine started|Backend library/i.test(log)
          ) {
            break
          }
        }
      }
      step(`startup-${instance.loader}`, {
        logExists: fs.existsSync(logPath),
        fresh,
        initialized: fresh && /Created: .*atlas|Sound engine started|Backend library/i.test(log),
        placeholders: /\$\{clientid\}|\$\{auth_xuid\}/.test(log),
        excerpt: log.slice(0, 500)
      })
      if (!fresh || !/ModLauncher running|Loading Minecraft .* with .*Loader/i.test(log)) {
        report.failures.push(`${instance.loader} did not reach mod loader startup`)
      } else if (!/Created: .*atlas|Sound engine started|Backend library/i.test(log)) {
        report.failures.push(`${instance.loader} did not reach client initialization`)
      }
      if (/\$\{clientid\}|\$\{auth_xuid\}/.test(log)) {
        report.failures.push(`${instance.loader} left unresolved launch placeholders`)
      }
      await page.evaluate(async ({ id }) => window.fangjie.stopInstance(id), {
        id: instance.id
      })
      await page.waitForTimeout(4000)
    }
  } catch (error) {
    report.failures.push(error.stack || String(error))
  } finally {
    fs.writeFileSync(path.join(artifacts, 'loader-launch-report.json'), JSON.stringify(report, null, 2))
    console.log('REPORT', path.join(artifacts, 'loader-launch-report.json'))
    if (report.failures.length) {
      console.error('FAILURES', report.failures)
      process.exitCode = 1
    }
    await app.close().catch(() => undefined)
  }
}

main()
