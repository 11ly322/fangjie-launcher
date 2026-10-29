const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')

const root = path.resolve(__dirname, '..')
const home = path.join(root, 'test-artifacts', 'e2e-home')
const artifacts = path.join(root, 'test-artifacts')
const shots = path.join(artifacts, 'shots')
fs.mkdirSync(shots, { recursive: true })

const report = { steps: [], failures: [] }

function step(name, data) {
  const entry = { at: new Date().toISOString(), step: name, ...data }
  report.steps.push(entry)
  console.log('STEP', JSON.stringify(entry))
}

async function main() {
  const electronPath = require('electron')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: electronPath,
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

  const snapshot = async () => {
    const result = await page.evaluate(async () => window.fangjie.snapshot())
    if (!result.ok) throw new Error(result.error)
    return result.value
  }

  const waitTask = async (taskId, timeoutMs = 12 * 60 * 1000) => {
    const deadline = Date.now() + timeoutMs
    let last = ''
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500)
      const task = (await snapshot()).tasks.find((item) => item.id === taskId)
      if (!task) throw new Error('task disappeared')
      const signature = `${Math.round(task.progress)}:${task.status}:${task.detail}`
      if (signature !== last) {
        last = signature
        console.log('TASK', task.status, Math.round(task.progress), task.detail)
      }
      if (['success', 'error', 'cancelled'].includes(task.status)) return task
    }
    throw new Error('task timed out')
  }

  try {
    const initial = await snapshot()
    const base = initial.instances.find((instance) => instance.loader === 'fabric')
    if (!base) throw new Error('missing base instance')

    // 1. Microsoft OAuth cancellation must settle after closing the login window.
    await page.evaluate(() => {
      window.__msResult = null
      window.fangjie.loginMicrosoft().then((result) => {
        window.__msResult = result
      })
    })
    const loginWindow = await app.waitForEvent('window', { timeout: 20000 })
    await loginWindow.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
    step('microsoft-window', { url: loginWindow.url() })
    const closed = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => {
        if (candidate.isDestroyed()) return false
        try {
          return candidate.webContents.getURL().startsWith('https://login.live.com')
        } catch {
          return false
        }
      })
      window?.close()
      return Boolean(window)
    })
    step('microsoft-close', { closed })
    await page.waitForFunction(() => Boolean(window.__msResult), null, { timeout: 15000 })
    const msResult = await page.evaluate(() => window.__msResult)
    step('microsoft-cancel', msResult)
    if (!msResult || msResult.ok) report.failures.push('Microsoft cancellation did not settle correctly')

    // 2. Validate previously verified CurseForge + skin artifacts.
    const gameDir = path.join(home, 'game', 'instances', base.id, '.minecraft')
    const mods = fs.readdirSync(path.join(gameDir, 'mods'))
    step('curseforge-skin-artifacts', {
      mods,
      skinConfig: fs.existsSync(path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json')),
      localSkin: fs.existsSync(
        path.join(gameDir, 'CustomSkinLoader', 'LocalSkin', 'skins', `${initial.account.name}.png`)
      )
    })
    if (!mods.some((file) => /mouse.*tweaks/i.test(file))) {
      report.failures.push('CurseForge mod artifact missing')
    }
    if (!mods.some((file) => /customskinloader/i.test(file))) {
      report.failures.push('CustomSkinLoader artifact missing')
    }

    // 3. Forge and NeoForge installs.
    for (const loader of ['forge', 'neoforge']) {
      const existing = (await snapshot()).instances.find((instance) => instance.loader === loader)
      if (existing) {
        step(`${loader}-existing`, { id: existing.id, versionId: existing.versionId })
        continue
      }
      const created = await page.evaluate(async ({ loader }) => {
        return window.fangjie.createInstance({
          name: `Loader ${loader}`,
          mcVersion: '1.21.4',
          loader,
          memoryMb: 4096,
          icon: 'compass',
          accent: '#8ecae6'
        })
      }, { loader })
      if (!created.ok) {
        report.failures.push(`${loader} create failed: ${created.error}`)
        continue
      }
      const task = await waitTask(created.value.taskId)
      const after = await snapshot()
      const instance = after.instances.find((item) => item.id === created.value.instance.id)
      step(`${loader}-install`, {
        status: task.status,
        error: task.error,
        versionId: instance?.versionId,
        loaderVersion: instance?.loaderVersion
      })
      if (task.status !== 'success' || !instance) {
        report.failures.push(`${loader} install ${task.status}: ${task.error || task.detail}`)
      }
    }

    await page.getByRole('button', { name: '游戏实例', exact: true }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(shots, 'loader-instances.png') })
  } catch (error) {
    report.failures.push(error.stack || String(error))
    console.error('LOADER TEST ERROR', error)
    await page.screenshot({ path: path.join(shots, 'loader-failure.png') }).catch(() => undefined)
  } finally {
    fs.writeFileSync(path.join(artifacts, 'loader-auth-report.json'), JSON.stringify(report, null, 2))
    console.log('REPORT', path.join(artifacts, 'loader-auth-report.json'))
    if (report.failures.length) {
      console.error('FAILURES', report.failures)
      process.exitCode = 1
    }
    await app.close().catch(() => undefined)
  }
}

main()
