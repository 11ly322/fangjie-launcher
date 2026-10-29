import { BrowserWindow, shell } from 'electron'
import type { Account } from '../shared/types'
import type { LauncherStore } from './store'
import { USER_AGENT } from './version'
import { requestResponse } from './downloadSource'

const CLIENT_ID = '00000000402b5328'
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf'
const OAUTH_AUTHORIZE = 'https://login.live.com/oauth20_authorize.srf'
const OAUTH_TOKEN = 'https://login.live.com/oauth20_token.srf'
const XBL_AUTH = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_AUTH = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE = 'https://api.minecraftservices.com/minecraft/profile'

interface MicrosoftSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  xuid?: string
  profile: { name: string; id: string }
}

interface MsTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

export async function loginMicrosoftAccount(
  store: LauncherStore,
  parentWindow: BrowserWindow | null
): Promise<Account> {
  const code = await requestOAuthCode(parentWindow)
  const tokens = await exchangeOAuthCode(code)
  const session = await completeMinecraftAuth(tokens.access_token, tokens.refresh_token, tokens.expires_in)
  return store.setMicrosoftAccount(
    { name: session.profile.name, id: session.profile.id },
    {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      xuid: session.xuid
    }
  )
}

export async function ensureMicrosoftSession(store: LauncherStore): Promise<{
  accessToken: string
  xuid?: string
  profile: { name: string; id: string }
}> {
  const account = store.getPublicAccount()
  if (account.type !== 'microsoft') throw new Error('当前不是正版账户')
  const stored = store.getMicrosoftAuth()
  if (!stored) throw new Error('正版登录已失效，请重新登录 Microsoft 账户')

  if (stored.expiresAt - Date.now() > 2 * 60 * 1000) {
    return {
      accessToken: stored.accessToken,
      xuid: stored.xuid,
      profile: { name: account.name, id: account.uuid.replace(/-/g, '') }
    }
  }

  try {
    const refreshed = await refreshOAuthToken(stored.refreshToken)
    const session = await completeMinecraftAuth(
      refreshed.access_token,
      refreshed.refresh_token,
      refreshed.expires_in
    )
    store.updateMicrosoftTokens({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      xuid: session.xuid
    })
    return {
      accessToken: session.accessToken,
      xuid: session.xuid,
      profile: { name: session.profile.name, id: session.profile.id }
    }
  } catch (error) {
    throw new Error(
      `正版登录已过期，请重新登录 Microsoft 账户：${errorMessage(error)}`
    )
  }
}

async function requestOAuthCode(parentWindow: BrowserWindow | null): Promise<string> {
  const redirect = new URL(OAUTH_AUTHORIZE)
  redirect.searchParams.set('client_id', CLIENT_ID)
  redirect.searchParams.set('response_type', 'code')
  redirect.searchParams.set('redirect_uri', REDIRECT_URI)
  redirect.searchParams.set('scope', 'XboxLive.signin offline_access')
  redirect.searchParams.set('prompt', 'select_account')
  redirect.searchParams.set('mkt', 'zh-CN')

  return new Promise<string>((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const loginWindow = new BrowserWindow({
      width: 520,
      height: 700,
      minWidth: 420,
      minHeight: 560,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      show: false,
      title: 'Microsoft 登录',
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        partition: 'persist:fangjie-microsoft',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    loginWindow.setMenu(null)
    loginWindow.once('ready-to-show', () => loginWindow.show())

    const finish = (value: string | null, error?: Error): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (value) resolve(value)
      else reject(error || new Error('登录已取消'))
      try {
        if (!loginWindow.isDestroyed()) loginWindow.close()
      } catch {
        /* the OAuth window may already be closing */
      }
    }

    const inspectUrl = (url: string): void => {
      if (settled) return
      if (!url.startsWith(REDIRECT_URI)) return
      try {
        const parsed = new URL(url)
        const code = parsed.searchParams.get('code')
        const error = parsed.searchParams.get('error_description') || parsed.searchParams.get('error')
        if (code) {
          finish(code)
        } else {
          finish(null, new Error(error ? `Microsoft 登录失败：${error}` : 'Microsoft 登录未返回授权码'))
        }
      } catch {
        finish(null, new Error('Microsoft 登录返回了无法解析的响应'))
      }
    }

    loginWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(REDIRECT_URI)) {
        event.preventDefault()
        inspectUrl(url)
      }
    })
    loginWindow.webContents.on('will-navigate', (_event, url) => inspectUrl(url))
    loginWindow.webContents.on('did-navigate', (_event, url) => inspectUrl(url))
    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    loginWindow.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame && validatedURL.startsWith('https://login.live.com')) {
          finish(null, new Error(`无法打开 Microsoft 登录页：${errorDescription}（${errorCode}）`))
        }
      }
    )
    loginWindow.on('closed', () => {
      if (!settled) finish(null, new Error('已取消 Microsoft 登录'))
    })

    timeout = setTimeout(() => {
      finish(null, new Error('Microsoft 登录超时，请重试'))
    }, 10 * 60 * 1000)

    void loginWindow.loadURL(redirect.toString()).catch((error) => {
      finish(null, new Error(`无法打开 Microsoft 登录页：${errorMessage(error)}`))
    })
  })
}

async function exchangeOAuthCode(code: string): Promise<MsTokenResponse> {
  const response = await requestResponse(OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI
    }),
    signal: AbortSignal.timeout(30_000)
  })
  const data = (await response.json()) as Partial<MsTokenResponse> & { error_description?: string }
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || `Microsoft 授权失败（HTTP ${response.status}）`)
  }
  return data as MsTokenResponse
}

async function refreshOAuthToken(refreshToken: string): Promise<MsTokenResponse> {
  const response = await requestResponse(OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(30_000)
  })
  const data = (await response.json()) as Partial<MsTokenResponse> & { error_description?: string }
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || 'Microsoft 登录刷新失败')
  }
  return data as MsTokenResponse
}

async function completeMinecraftAuth(
  msAccessToken: string,
  refreshToken: string,
  expiresIn?: number
): Promise<MicrosoftSession> {
  const xblResponse = await requestResponse(XBL_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!xblResponse.ok) {
    throw new Error(`Xbox Live 登录失败（HTTP ${xblResponse.status}）`)
  }
  const xbl = (await xblResponse.json()) as {
    Token: string
    DisplayClaims?: { xui?: Array<{ uhs: string }> }
  }

  const xstsResponse = await requestResponse(XSTS_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xbl.Token]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }),
    signal: AbortSignal.timeout(30_000)
  })
  const xsts = (await xstsResponse.json()) as {
    Token?: string
    XErr?: number
    DisplayClaims?: { xui?: Array<{ uhs: string; xid?: string }> }
  }
  if (!xstsResponse.ok || !xsts.Token) {
    throw new Error(xstsErrorMessage(xsts.XErr))
  }
  const uhs = xsts.DisplayClaims?.xui?.[0]?.uhs || xbl.DisplayClaims?.xui?.[0]?.uhs
  if (!uhs) throw new Error('Xbox Live 未返回用户标识')

  const mcResponse = await requestResponse(MC_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
    }),
    signal: AbortSignal.timeout(30_000)
  })
  const mc = (await mcResponse.json()) as {
    access_token?: string
    expires_in?: number
    errorMessage?: string
  }
  if (!mcResponse.ok || !mc.access_token) {
    throw new Error(
      mc.errorMessage || `Minecraft 服务登录失败（HTTP ${mcResponse.status}）`
    )
  }

  const profileResponse = await requestResponse(MC_PROFILE, {
    headers: {
      Authorization: `Bearer ${mc.access_token}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(30_000)
  })
  if (profileResponse.status === 404) {
    throw new Error('这个 Microsoft 账号没有 Minecraft: Java Edition，无法用于正版启动')
  }
  const profile = (await profileResponse.json()) as { id?: string; name?: string }
  if (!profileResponse.ok || !profile.id || !profile.name) {
    throw new Error(`无法获取 Minecraft 玩家档案（HTTP ${profileResponse.status}）`)
  }

  return {
    accessToken: mc.access_token,
    refreshToken,
    expiresAt: Date.now() + Math.max(60, (mc.expires_in || expiresIn || 86_400) - 60) * 1000,
    xuid: xsts.DisplayClaims?.xui?.[0]?.xid,
    profile: { name: profile.name, id: profile.id }
  }
}

function xstsErrorMessage(code?: number): string {
  if (code === 2148916233) return '该 Microsoft 账号还没有 Xbox 账户'
  if (code === 2148916235) return '该 Microsoft 账号所在地区无法使用 Xbox Live'
  if (code === 2148916238) {
    return '该账号是未成年人账号，需要由家庭组中的成年人授权后才能登录'
  }
  if (code === 2148916220) return '该 Microsoft 账号所在地区无法使用 Minecraft 服务'
  return 'Xbox Live 身份验证失败，请稍后重试'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
