const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')

const root = path.resolve(__dirname, '..')
const home = path.join(root, 'test-artifacts', 'e2e-home')
const artifacts = path.join(root, 'test-artifacts')
const shots = path.join(artifacts, 'shots')
fs.mkdirSync(shots, { recursive: true })
fs.mkdirSync(home, { recursive: true })
// Keep the shared vanilla cache between runs; fresh installs were already exercised.
fs.rmSync(path.join(home, 'config.json'), { force: true })
fs.rmSync(path.join(home, 'game', 'instances'), { recursive: true, force: true })
fs.rmSync(path.join(home, 'launcher-main.log'), { force: true })

const report = {
  startedAt: new Date().toISOString(),
  steps: [],
  errors: [],
  warnings: [],
  instance: null,
  task: null,
  mod: null,
  launch: null
}

function record(step, detail) {
  const entry = { at: new Date().toISOString(), step, ...detail }
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

  const electronLogPath = path.join(artifacts, 'e2e-electron.log')
  fs.writeFileSync(electronLogPath, '')
  const child = app.process()
  child.stdout?.on('data', (data) => fs.appendFileSync(electronLogPath, `[out] ${data}`))
  child.stderr?.on('data', (data) => fs.appendFileSync(electronLogPath, `[err] ${data}`))
  child.on('exit', (code, signal) => {
    record('electron-exit', { code, signal })
    fs.appendFileSync(electronLogPath, `[exit] code=${code} signal=${signal}\n`)
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`)
  })

  try {
    await page.waitForSelector('.hero-play', { timeout: 30000 })
    await page.screenshot({ path: path.join(shots, 'e2e-01-empty.png') })
    record('bootstrap', { url: page.url() })

    const created = await page.evaluate(async () => {
      return window.fangjie.createInstance({
        name: 'E2E 生存测试',
        mcVersion: '1.21.4',
        loader: 'fabric',
        memoryMb: 4096,
        icon: 'pickaxe',
        accent: '#b8e85c'
      })
    })
    if (!created.ok) throw new Error(`createInstance failed: ${created.error}`)
    const taskId = created.value.taskId
    const targetId = created.value.instance.id
    report.instance = { id: targetId, taskId }
    record('createInstance', { instanceId: targetId, taskId })

    let lastLog = 0
    let task
    const deadline = Date.now() + 20 * 60 * 1000
    let progressShot = false
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000)
      const snapshot = await page.evaluate(async () => window.fangjie.snapshot())
      if (!snapshot.ok) throw new Error(`snapshot failed: ${snapshot.error}`)
      task = snapshot.value.tasks.find((item) => item.id === taskId)
      if (!task) throw new Error('install task disappeared')
      const now = Date.now()
      if (now - lastLog > 5000) {
        lastLog = now
        record('install-progress', {
          status: task.status,
          progress: Math.round(task.progress),
          detail: task.detail
        })
      }
      if (!progressShot && task.progress > 12) {
        progressShot = true
        await page.screenshot({ path: path.join(shots, 'e2e-02-installing.png') })
      }
      if (task.status === 'success' || task.status === 'error' || task.status === 'cancelled') break
    }
    report.task = task
    if (!task || task.status !== 'success') {
      throw new Error(`installation ended with ${task?.status}: ${task?.error || task?.detail}`)
    }
    record('install-complete', { progress: task.progress })

    const snapshotAfterInstall = await page.evaluate(async () => window.fangjie.snapshot())
    const instance = snapshotAfterInstall.value.instances.find((item) => item.id === targetId)
    if (!instance) throw new Error('instance was not saved after successful installation')
    report.instance.saved = instance
    const gameDir = path.join(home, 'game', 'instances', targetId, '.minecraft')
    const versionJson = path.join(home, 'game', 'minecraft', 'versions', instance.versionId, `${instance.versionId}.json`)
    const javaExe = path.join(home, 'game', 'minecraft', 'runtime', 'java-runtime-delta', 'bin', 'java.exe')
    record('files-installed', {
      gameDir: fs.existsSync(gameDir),
      versionJson: fs.existsSync(versionJson),
      javaExe: fs.existsSync(javaExe),
      javaExeSize: fs.existsSync(javaExe) ? fs.statSync(javaExe).size : 0
    })
    if (!fs.existsSync(versionJson)) throw new Error(`version json missing: ${versionJson}`)
    if (!fs.existsSync(javaExe)) throw new Error(`java runtime missing: ${javaExe}`)

    const modResult = await page.evaluate(
      async ({ id }) => window.fangjie.installMod(id, 'AANobbMI'),
      { id: targetId }
    )
    if (!modResult.ok) throw new Error(`installMod failed: ${modResult.error}`)
    const modTaskId = modResult.value.taskId
    record('installMod', { taskId: modTaskId })

    let modTask
    const modDeadline = Date.now() + 5 * 60 * 1000
    let lastModLog = 0
    while (Date.now() < modDeadline) {
      await page.waitForTimeout(1500)
      const snapshot = await page.evaluate(async () => window.fangjie.snapshot())
      modTask = snapshot.value.tasks.find((item) => item.id === modTaskId)
      if (!modTask) throw new Error('mod task disappeared')
      if (Date.now() - lastModLog > 4000) {
        lastModLog = Date.now()
        record('mod-progress', {
          status: modTask.status,
          progress: Math.round(modTask.progress),
          detail: modTask.detail
        })
      }
      if (['success', 'error', 'cancelled'].includes(modTask.status)) break
    }
    report.mod = modTask
    if (!modTask || modTask.status !== 'success') {
      throw new Error(`mod installation ended with ${modTask?.status}: ${modTask?.error || modTask?.detail}`)
    }
    const modsDir = path.join(gameDir, 'mods')
    const modFiles = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : []
    record('mod-installed', { modFiles })
    if (!modFiles.some((file) => file.endsWith('.jar'))) throw new Error('no mod jar was downloaded')

    await page.evaluate(() => {
      window.__launchStates = []
      window.fangjie.onLaunchState((state) => window.__launchStates.push(state))
    })
    const launchResult = await page.evaluate(
      async ({ id }) => window.fangjie.launchInstance(id),
      { id: targetId }
    )
    record('launch-result', launchResult)
    if (!launchResult.ok) throw new Error(`launch failed: ${launchResult.error}`)

    const launchDeadline = Date.now() + 90 * 1000
    let running = false
    let launchFailure = null
    while (Date.now() < launchDeadline) {
      await page.waitForTimeout(2000)
      const snapshot = await page.evaluate(async () => window.fangjie.snapshot())
      if (snapshot.value.runningInstanceIds.includes(targetId)) {
        running = true
        break
      }
      const launchStates = await page.evaluate(() => window.__launchStates || [])
      launchFailure = launchStates.find((state) => state.status === 'error')
      if (launchFailure) break
    }
    const logDir = path.join(gameDir, 'logs')
    const logFiles = fs.existsSync(logDir) ? fs.readdirSync(logDir) : []
    const latestLog = logFiles.find((file) => file === 'latest.log')
    let logTail = ''
    if (latestLog) {
      const content = fs.readFileSync(path.join(logDir, latestLog), 'utf8')
      logTail = content.slice(-4000)
    }
    if (!running) {
      const launcherLogs = logFiles.filter((file) => file.startsWith('launcher-'))
      const lastLogFile = launcherLogs.sort().pop()
      if (lastLogFile) {
        logTail = fs.readFileSync(path.join(logDir, lastLogFile), 'utf8').slice(-6000)
      }
      throw new Error(
        `game did not stay running. launch states: ${JSON.stringify(
          await page.evaluate(() => window.__launchStates || []).catch(() => [])
        )}\nlog tail:\n${logTail}`
      )
    }
    record('launch-running', { running: true, logTail: logTail.slice(-1200) })
    report.launch = { running: true, logTail: logTail.slice(-2000) }

    await page.waitForTimeout(10000)
    const processList = require('node:child_process')
      .execFileSync('tasklist', ['/FI', 'IMAGENAME eq java.exe', '/FO', 'CSV'], { encoding: 'utf8' })
      .trim()
    record('java-process', { processList: processList.slice(0, 1000) })

    await page.screenshot({ path: path.join(shots, 'e2e-03-running.png') })
    const stopResult = await page.evaluate(
      async ({ id }) => window.fangjie.stopInstance(id),
      { id: targetId }
    )
    record('stop', stopResult)
    await page.waitForTimeout(3000)
  } catch (error) {
    report.errors.push(error.stack || String(error))
    console.error('E2E FAILED', error)
    await page.screenshot({ path: path.join(shots, 'e2e-failure.png') }).catch(() => undefined)
    process.exitCode = 1
  } finally {
    report.finishedAt = new Date().toISOString()
    fs.writeFileSync(path.join(artifacts, 'e2e-report.json'), JSON.stringify(report, null, 2))
    console.log('REPORT', path.join(artifacts, 'e2e-report.json'))
    await app.close().catch(() => undefined)
  }
}

main()
