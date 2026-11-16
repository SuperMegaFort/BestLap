import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LMU_STEAM_APP_ID = '2399420';

export type DisplayServer = 'wayland' | 'x11' | 'headless';

export interface LinuxEnvironmentInfo {
  platform: NodeJS.Platform;
  displayServer: DisplayServer;
  steamRoot: string | null;
  lmuPrefixPath: string | null;
  shmAvailable: boolean;
}

/**
 * Detects whether the current Linux session runs on Wayland, X11, or headless.
 */
export function detectDisplayServer(env: NodeJS.ProcessEnv = process.env): DisplayServer {
  if (env.WAYLAND_DISPLAY || env.XDG_SESSION_TYPE === 'wayland') {
    return 'wayland';
  }
  if (env.DISPLAY || env.XDG_SESSION_TYPE === 'x11') {
    return 'x11';
  }
  return 'headless';
}

/**
 * Finds the Steam installation root on Linux (native or Flatpak).
 */
export function findSteamRoot(homeDir: string = os.homedir()): string | null {
  const candidates = [
    path.join(homeDir, '.steam', 'steam'),
    path.join(homeDir, '.local', 'share', 'Steam'),
    path.join(homeDir, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolves the Proton Wine prefix for Le Mans Ultimate (AppID 2399420) if present.
 */
export function findLmuProtonPrefix(steamRoot: string | null): string | null {
  if (!steamRoot) return null;

  const compatPath = path.join(steamRoot, 'steamapps', 'compatdata', LMU_STEAM_APP_ID, 'pfx');
  if (fs.existsSync(compatPath)) {
    return compatPath;
  }
  return null;
}

/**
 * Resolves the exact Proton executable used by LMU (AppID 2399420) from Steam's compatdata config_info.
 */
export function findLmuProtonBinary(steamRoot: string | null): string | null {
  if (!steamRoot) return null;

  const compatDir = path.join(steamRoot, 'steamapps', 'compatdata', LMU_STEAM_APP_ID);
  const configInfoPath = path.join(compatDir, 'config_info');
  if (fs.existsSync(configInfoPath)) {
    try {
      const lines = fs.readFileSync(configInfoPath, 'utf8').split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        const filesIdx = line.indexOf('/files/');
        const distIdx = line.indexOf('/dist/');
        const cutIdx = filesIdx !== -1 ? filesIdx : distIdx;
        if (cutIdx > 0) {
          const candidate = path.join(line.slice(0, cutIdx), 'proton');
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    } catch {
      // Ignore parse errors and fall back
    }
  }

  const versionPath = path.join(compatDir, 'version');
  if (fs.existsSync(versionPath)) {
    try {
      const versionName = fs.readFileSync(versionPath, 'utf8').trim();
      if (versionName) {
        const candidates = [
          path.join(steamRoot, 'compatibilitytools.d', versionName, 'proton'),
          path.join(os.homedir(), '.local', 'share', 'Steam', 'compatibilitytools.d', versionName, 'proton'),
          path.join(steamRoot, 'steamapps', 'common', versionName, 'proton'),
        ];
        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Collects Linux-specific runtime paths and display server metadata.
 */
export function getLinuxEnvironment(): LinuxEnvironmentInfo {
  const steamRoot = process.platform === 'linux' ? findSteamRoot() : null;
  const lmuPrefixPath = findLmuProtonPrefix(steamRoot);
  const shmAvailable = process.platform === 'linux' && fs.existsSync('/dev/shm');

  return {
    platform: process.platform,
    displayServer: process.platform === 'linux' ? detectDisplayServer() : 'headless',
    steamRoot,
    lmuPrefixPath,
    shmAvailable,
  };
}
