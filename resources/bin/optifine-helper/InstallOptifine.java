import java.io.File;

/**
 * Minimal headless bridge for the official OptiFine installer.
 * OptiFine has no CLI, but its installer exposes doInstall(File).
 * Compile with: javac -cp OptiFine_<version>.jar InstallOptifine.java
 */
public class InstallOptifine {
  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      throw new IllegalArgumentException("usage: InstallOptifine <minecraft-dir>");
    }
    optifine.Installer.doInstall(new File(args[0]));
  }
}
