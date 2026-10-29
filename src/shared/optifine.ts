/** Extract the Minecraft version from an official OptiFine installer name. */
export function optifineMinecraftVersion(fileName: string): string | null {
  const match = fileName.match(/optifine[_-](\d+\.\d+(?:\.\d+)?)/i)
  return match?.[1] || null
}
