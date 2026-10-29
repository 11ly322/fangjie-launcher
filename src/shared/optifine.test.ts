import { describe, expect, it } from 'vitest'
import { optifineMinecraftVersion } from './optifine'

describe('OptiFine installer parsing', () => {
  it('extracts Minecraft version from official installer names', () => {
    expect(optifineMinecraftVersion('OptiFine_1.20.1_HD_U_I6.jar')).toBe('1.20.1')
    expect(optifineMinecraftVersion('OptiFine_1.21_HD_U_J1.jar')).toBe('1.21')
  })

  it('rejects unrelated jars', () => {
    expect(optifineMinecraftVersion('fabric-api.jar')).toBeNull()
  })
})
