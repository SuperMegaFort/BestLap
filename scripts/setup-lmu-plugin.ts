import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/core/config.ts';
import { findLmuProtonPrefix, findSteamRoot } from '../src/platform/linux-paths.ts';

const PLUGIN_DLL_NAME = 'rFactor2SharedMemoryMapPlugin64.dll';
const OFFICIAL_DOWNLOAD_URL =
  'https://www.mediafire.com/file/s6ojcr9zrs6q9ls/rf2_sm_tools_3.7.15.1.zip/file';

function findLmuInstallDir(steamRoot: string | null): string | null {
  if (process.env.BESTLAP_LMU_DIR && fs.existsSync(process.env.BESTLAP_LMU_DIR)) {
    return process.env.BESTLAP_LMU_DIR;
  }
  const home = os.homedir();
  const candidates = [
    steamRoot ? path.join(steamRoot, 'steamapps', 'common', 'Le Mans Ultimate') : '',
    path.join(home, '.steam', 'steam', 'steamapps', 'common', 'Le Mans Ultimate'),
    path.join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Le Mans Ultimate'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function enablePluginInConfig(lmuDir: string): void {
  const customVarsPath = path.join(lmuDir, 'UserData', 'player', 'CustomPluginVariables.JSON');
  fs.mkdirSync(path.dirname(customVarsPath), { recursive: true });

  let config: Record<string, Record<string, number>> = {};
  if (fs.existsSync(customVarsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(customVarsPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = parsed as Record<string, Record<string, number>>;
      }
    } catch {
      config = {};
    }
  }

  config[` ${PLUGIN_DLL_NAME}`] = undefined as unknown as Record<string, number>;
  delete config[` ${PLUGIN_DLL_NAME}`];
  config[PLUGIN_DLL_NAME] = {
    ...(config[PLUGIN_DLL_NAME] ?? {}),
    ' Enabled': 1,
    DedicatedServerMapGlobally: 0,
    EnableDirectMemoryAccess: 1,
  };

  fs.writeFileSync(customVarsPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`[Setup] Enabled ${PLUGIN_DLL_NAME} in ${customVarsPath}`);
}

function findLocalPluginZip(): string | null {
  if (process.env.BESTLAP_PLUGIN_ZIP && fs.existsSync(process.env.BESTLAP_PLUGIN_ZIP)) {
    return process.env.BESTLAP_PLUGIN_ZIP;
  }
  const home = os.homedir();
  for (const dir of [path.join(home, 'Downloads'), path.join(home, 'Téléchargements')]) {
    if (!fs.existsSync(dir)) continue;
    const match = fs
      .readdirSync(dir)
      .find((f) => f.toLowerCase().startsWith('rf2_sm_tools') && f.toLowerCase().endsWith('.zip'));
    if (match) return path.join(dir, match);
  }
  return null;
}

async function installPluginDll(pluginsDir: string): Promise<boolean> {
  const targetDll = path.join(pluginsDir, PLUGIN_DLL_NAME);
  if (fs.existsSync(targetDll)) {
    console.log(`[Setup] ${PLUGIN_DLL_NAME} already exists at ${targetDll}`);
    return true;
  }

  if (process.env.BESTLAP_PLUGIN_DLL && fs.existsSync(process.env.BESTLAP_PLUGIN_DLL)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.copyFileSync(process.env.BESTLAP_PLUGIN_DLL, targetDll);
    console.log(`[Setup] Installed ${PLUGIN_DLL_NAME} -> ${targetDll}`);
    return true;
  }

  const zipPath = findLocalPluginZip();
  if (!zipPath) {
    console.log(`\n[Setup] ${PLUGIN_DLL_NAME} is not installed yet.`);
    console.log('[Setup] Download the official plugin archive (MIT) from:');
    console.log(`        ${OFFICIAL_DOWNLOAD_URL}`);
    console.log('[Setup] Then save it to ~/Téléchargements (or ~/Downloads) and re-run:');
    console.log('        npm run setup:lmu-plugin');
    console.log('        (or copy rFactor2SharedMemoryMapPlugin64.dll into ' + pluginsDir + ')\n');
    return false;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bestlap-rf2smmp-'));
  try {
    execFileSync('unzip', ['-o', zipPath, '-d', tmpDir], { stdio: 'ignore' });

    const findDll = (dir: string): string | null => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = findDll(full);
          if (found) return found;
        } else if (entry.name === PLUGIN_DLL_NAME) {
          return full;
        }
      }
      return null;
    };

    const extractedDll = findDll(tmpDir);
    if (!extractedDll) {
      throw new Error(`${PLUGIN_DLL_NAME} not found inside ${zipPath}`);
    }

    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.copyFileSync(extractedDll, targetDll);
    console.log(`[Setup] Extracted & installed ${PLUGIN_DLL_NAME} -> ${targetDll}`);
    return true;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function tryBuildBridge(): string | null {
  const src = path.join(PROJECT_ROOT, 'bridge', 'lmu_shm_bridge.c');
  const out = path.join(PROJECT_ROOT, 'bridge', 'lmu_shm_bridge.exe');
  try {
    execFileSync('which', ['x86_64-w64-mingw32-gcc'], { stdio: 'ignore' });
    execFileSync('x86_64-w64-mingw32-gcc', ['-O2', src, '-o', out, '-lws2_32'], {
      stdio: 'inherit',
    });
    console.log(`[Setup] Built Wine/Proton UDP bridge -> ${out}`);
    return out;
  } catch {
    console.log(
      '[Setup] mingw-w64 (x86_64-w64-mingw32-gcc) not found. Install mingw-w64 to compile bridge/lmu_shm_bridge.exe.'
    );
    return null;
  }
}

async function main(): Promise<void> {
  const steamRoot = findSteamRoot();
  const lmuDir = findLmuInstallDir(steamRoot);
  const protonPrefix = findLmuProtonPrefix(steamRoot);

  if (!lmuDir) {
    console.error('[Setup] Could not locate Le Mans Ultimate folder. Set BESTLAP_LMU_DIR=/path/to/LMU.');
    process.exit(1);
  }

  console.log(`[Setup] Found LMU at: ${lmuDir}`);
  if (protonPrefix) {
    console.log(`[Setup] Found Proton prefix: ${protonPrefix}`);
  }

  const dllInstalled = await installPluginDll(path.join(lmuDir, 'Plugins'));
  enablePluginInConfig(lmuDir);
  const bridgeExe = tryBuildBridge();

  if (dllInstalled && protonPrefix && bridgeExe) {
    console.log('\n[Setup] To stream 60Hz SHM telemetry from LMU Proton prefix, run:');
    console.log(`  WINEPREFIX="${protonPrefix}" wine "${bridgeExe}"`);
  }
}

main().catch((err) => {
  console.error('[Setup] Error:', err);
  process.exit(1);
});
