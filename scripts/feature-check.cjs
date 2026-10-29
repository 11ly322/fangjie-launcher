const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')

const root = path.resolve(__dirname, '..')
const home = path.join(root, 'test-artifacts', 'e2e-home')
const artifacts = path.join(root, 'test-artifacts')
const shots = path.join(artifacts, 'shots')
fs.mkdirSync(shots, { recursive: true })

const report = { steps: [], failures: [], startedAt: new Date().toISOString() }

function step(name, data) {
  const entry = { at: new Date().toISOString(), step: name, ...data }
  report.steps.push(entry)
  console.log('STEP', JSON.stringify(entry))
}

function seedSkin() {
  const configPath = path.join(home, 'config.json')
  if (!fs.existsSync(configPath)) throw new Error('Run e2e-check.cjs first to create the test instance')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const uuid = config.account.uuid
  const skinsDir = path.join(home, 'skins')
  fs.mkdirSync(skinsDir, { recursive: true })
  const fileName = `${uuid}.png`
  fs.copyFileSync(path.join(artifacts, 'test-skin.png'), path.join(skinsDir, fileName))
  config.account.skin = { fileName, model: 'classic', appliedInstanceIds: [] }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  step('seed-skin', { fileName })
}

async function main() {
  seedSkin()
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
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const snapshot = async () => {
    const result = await page.evaluate(async () => window.fangjie.snapshot())
    if (!result.ok) throw new Error(`snapshot failed: ${result.error}`)
    return result.value
  }

  const waitTask = async (taskId, timeoutMs = 10 * 60 * 1000) => {
    const deadline = Date.now() + timeoutMs
    let last = ''
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500)
      const snap = await snapshot()
      const task = snap.tasks.find((item) => item.id === taskId)
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
    await page.waitForSelector('.hero-play', { timeout: 30000 })
    const initial = await snapshot()
    const fabricInstance = initial.instances.find((instance) => instance.loader === 'fabric')
    if (!fabricInstance) throw new Error('no Fabric test instance found')
    step('bootstrap', {
      instances: initial.instances.length,
      fabric: fabricInstance.id,
      skin: Boolean(initial.account.skin)
    })

    // Microsoft login: open the real OAuth window, verify the URL, cancel it.
    await page.evaluate(() => {
      window.__msResult = null
      window.fangjie.loginMicrosoft().then((result) => {
        window.__msResult = result
      })
    })
    const loginWindow = await app.waitForEvent('window', { timeout: 20000 }).catch(() => null)
    if (!loginWindow) {
      report.failures.push('Microsoft login window did not open')
    } else {
      await loginWindow.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
      const loginUrl = loginWindow.url()
      step('microsoft-window', { url: loginUrl })
      if (!loginUrl.includes('login.live.com')) {
        report.failures.push(`Unexpected Microsoft login URL: ${loginUrl}`)
      }
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
      await page
        .waitForFunction(() => Boolean(window.__msResult), null, { timeout: 20000 })
        .catch(() => undefined)
      const microsoftResult = await page.evaluate(() => window.__msResult || null)
      step('microsoft-cancel', microsoftResult)
      if (!microsoftResult) {
        report.failures.push('Microsoft login did not settle after closing its window')
      } else if (microsoftResult.ok) {
        report.failures.push('Microsoft login unexpectedly succeeded after cancel')
      }
    }
    await page.waitForTimeout(300)

    // CurseForge source search
    const cfSearch = await page.evaluate(async ({ instanceId }) => {
      return window.fangjie.searchMods('Mouse Tweaks', {
        source: 'curseforge',
        instanceId,
        limit: 6
      })
    }, { instanceId: fabricInstance.id })
    if (!cfSearch.ok) {
      report.failures.push(`CurseForge search failed: ${cfSearch.error}`)
    } else {
      step('curseforge-search', {
        hits: cfSearch.value.hits.length,
        first: cfSearch.value.hits[0] && {
          id: cfSearch.value.hits[0].project_id,
          title: cfSearch.value.hits[0].title,
          source: cfSearch.value.hits[0].source
        }
      })
      if (!cfSearch.value.hits.some((hit) => hit.project_id === 'cf-60089')) {
        report.failures.push('Mouse Tweaks was not found in CurseForge results')
      }
    }

    const cfDetail = await page.evaluate(async ({ instanceId }) => {
      return window.fangjie.getModProject('cf-60089', instanceId)
    }, { instanceId: fabricInstance.id })
    if (!cfDetail.ok) {
      report.failures.push(`CurseForge detail failed: ${cfDetail.error}`)
    } else {
      step('curseforge-detail', {
        title: cfDetail.value.project.title,
        versions: cfDetail.value.versions.length,
        firstFile: cfDetail.value.versions[0]?.files[0]?.filename
      })
      if (!cfDetail.value.versions.length) {
        report.failures.push('CurseForge project has no compatible versions')
      }
    }

    // Install a CurseForge mod into the existing Fabric instance
    if (cfDetail.ok && cfDetail.value.versions.length) {
      const install = await page.evaluate(async ({ instanceId }) => {
        return window.fangjie.installMod(instanceId, 'cf-60089')
      }, { instanceId: fabricInstance.id })
      if (!install.ok) {
        report.failures.push(`CurseForge mod install failed: ${install.error}`)
      } else {
        const task = await waitTask(install.value.taskId)
        step('curseforge-install', {
          status: task.status,
          detail: task.detail,
          error: task.error
        })
        if (task.status !== 'success') report.failures.push(`CurseForge install ${task.status}: ${task.error}`)
      }
    }

    // Apply local skin (installs CustomSkinLoader + config)
    const skinApply = await page.evaluate(async ({ instanceId }) => {
      return window.fangjie.applySkin(instanceId)
    }, { instanceId: fabricInstance.id })
    step('skin-apply', skinApply)
    if (!skinApply.ok) report.failures.push(`Skin apply failed: ${skinApply.error}`)
    else {
      const gameDir = path.join(home, 'game', 'instances', fabricInstance.id, '.minecraft')
      const configPath = path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json')
      const skinPath = path.join(gameDir, 'CustomSkinLoader', 'LocalSkin', 'skins', `${initial.account.name}.png`)
      const mods = fs.readdirSync(path.join(gameDir, 'mods'))
      step('skin-files', {
        config: fs.existsSync(configPath),
        skin: fs.existsSync(skinPath),
        mods: mods.filter((file) => /customskin/i.test(file)),
        loadlist: fs.existsSync(configPath)
          ? JSON.parse(fs.readFileSync(configPath, 'utf8')).loadlist
          : null
      })
      if (!fs.existsSync(configPath) || !fs.existsSync(skinPath)) {
        report.failures.push('Local skin files were not written to the instance')
      }
    }

    // Loader installations: Quilt, Forge, NeoForge
    for (const loader of ['quilt', 'forge', 'neoforge']) {
      const created = await page.evaluate(async ({ loader }) => {
        return window.fangjie.createInstance({
          name: `Feature ${loader}`,
          mcVersion: '1.21.4',
          loader,
          memoryMb: 4096,
          icon: 'compass',
          accent: '#8ecae6'
        })
      }, { loader })
      if (!created.ok) {
        report.failures.push(`${loader} instance creation failed: ${created.error}`)
        continue
      }
      const task = await waitTask(created.value.taskId, 12 * 60 * 1000)
      const after = await snapshot()
      const installed = after.instances.find((instance) => instance.id === created.value.instance.id)
      step(`${loader}-install`, {
        status: task.status,
        error: task.error,
        versionId: installed?.versionId,
        loaderVersion: installed?.loaderVersion
      })
      if (task.status !== 'success' || !installed) {
        report.failures.push(`${loader} install ${task.status}: ${task.error || task.detail}`)
      }
    }

    await page.getByRole('button', { name: '游戏实例', exact: true }).click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(shots, 'feature-instances.png') })

    await page.getByRole('button', { name: '模组工坊', exact: true }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(shots, 'feature-mods.png') })

    await page.locator('.account-card').click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(shots, 'feature-account.png') })
    await page.getByRole('tab', { name: /正版登录/ }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(shots, 'feature-account-microsoft.png') })
  } catch (error) {
    report.failures.push(error.stack || String(error))
    await page.screenshot({ path: path.join(shots, 'feature-failure.png') }).catch(() => undefined)
    console.error('FEATURE TEST ERROR', error)
    process.exitCode = 1
  } finally {
    report.consoleErrors = consoleErrors
    report.finishedAt = new Date().toISOString()
    fs.writeFileSync(path.join(artifacts, 'feature-report.json'), JSON.stringify(report, null, 2))
    console.log('REPORT', path.join(artifacts, 'feature-report.json'))
    if (report.failures.length) {
      console.error('FAILURES', report.failures)
      process.exitCode = 1
    }
    await app.close().catch(() => undefined)
  }
}

main()
