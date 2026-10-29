import { app } from 'electron'

/**
 * Single source of truth for the launcher version in the main process.
 * `app.getVersion()` reads the packaged package.json version, so cutting a
 * release only requires changing `package.json`.
 */
export const APP_VERSION = app.getVersion()

export const USER_AGENT = `fangjie-launcher/${APP_VERSION} (local Minecraft launcher)`
