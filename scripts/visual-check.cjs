const fs = require('node:fs')
const path = require('node:path')
const { _electron: electron } = require('playwright-core')

const root = path.resolve(__dirname, '..')
const home = process.env.FJ_VISUAL_HOME
  ? path.resolve(process.env.FJ_VISUAL_HOME)
  : path.join(root, 'test-artifacts', 'visual-home')
const shots = path.join(root, 'test-artifacts', 'shots')
const artifacts = path.join(root, 'test-artifacts')
fs.mkdirSync(shots, { recursive: true })

async function main() {
  require('./seed-visual.cjs')
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
      FJ_TEST_MEMORY: '6144',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1'
    },
    timeout: 60000
  })

  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []

  const page = await app.firstWindow()
  const nav = page.getByRole('navigation', { name: '主导航' })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message))
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`)
  })

  const shot = async (name) => {
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(shots, `${name}.png`) })
    console.log('SHOT', name)
  }

  try {
    await page.waitForSelector('.hero-play', { timeout: 30000 })
    await page.evaluate(() => localStorage.setItem('fangjie.modSource', 'modrinth'))
    await page.waitForTimeout(1800)
    await shot('01-home')

    await nav.getByRole('button', { name: '游戏实例', exact: true }).click()
    await page.waitForSelector('.instance-card')
    await shot('02-instances')

    await page.locator('.instance-card__hit').first().click()
    await page.waitForSelector('.detail-hero')
    await shot('03-instance-detail')

    await page.getByRole('tab', { name: /模组/ }).click()
    await page.waitForTimeout(500)
    await shot('04-instance-mods')

    await page.getByRole('button', { name: '所有实例' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '新建实例', exact: true }).first().click()
    await page.waitForSelector('.version-chip', { timeout: 30000 })
    await shot('05-create-instance')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await nav.getByRole('button', { name: '模组工坊', exact: true }).click()
    await page.waitForSelector('.mod-card', { timeout: 30000 })
    await page.waitForTimeout(1000)
    await shot('06-mods')

    await page.locator('.mod-card__hit').first().click()
    await page.waitForSelector('.mod-version-panel', { timeout: 30000 }).catch(() => undefined)
    await page.waitForTimeout(800)
    await shot('07-mod-detail')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await page.getByLabel('模组下载源').selectOption('curseforge')
    await page.waitForTimeout(3000)
    await shot('08-mods-curseforge')

    await nav.getByRole('button', { name: '下载中心', exact: true }).click()
    await shot('09-downloads')

    await page.getByRole('button', { name: '设置', exact: true }).click()
    await shot('10-settings')

    await page.locator('.account-card').click()
    await page.waitForTimeout(500)
    await shot('11-account')
    await page.getByRole('tab', { name: /正版登录/ }).click()
    await page.waitForTimeout(400)
    await shot('12-account-microsoft')
    await page.keyboard.press('Escape')

    await nav.getByRole('button', { name: '首页', exact: true }).click()
    await page.waitForTimeout(300)
    await page.locator('.hero-play button').filter({ hasText: '装模组' }).click()
    await page.waitForSelector('.mods-filter-panel')
    await shot('13-mods-with-instance')

    await nav.getByRole('button', { name: '房间联机', exact: true }).click()
    await page.waitForSelector('.multiplayer-page')
    await shot('14-multiplayer')

    fs.writeFileSync(
      path.join(artifacts, 'ui-report.json'),
      JSON.stringify({ consoleErrors, pageErrors, failedRequests }, null, 2)
    )
    console.log('REPORT', path.join(artifacts, 'ui-report.json'))
    if (consoleErrors.length || pageErrors.length) {
      console.log('CONSOLE ERRORS', consoleErrors.slice(0, 10))
      console.log('PAGE ERRORS', pageErrors.slice(0, 5))
    }
  } catch (error) {
    await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => undefined)
    console.error('VISUAL TEST FAILED', error)
    console.error('CONSOLE ERRORS', consoleErrors)
    console.error('PAGE ERRORS', pageErrors)
    process.exitCode = 1
  } finally {
    await app.close().catch(() => undefined)
  }
}

main()
