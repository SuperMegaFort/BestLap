import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AppConfig {
  server: {
    host: string;
    port: number;
    broadcastHz: number;
  };
  telemetry: {
    provider: 'auto' | 'lmu-rest' | 'lmu-shm' | 'mock';
    lmuRest: {
      baseUrl: string;
      pollIntervalMs: number;
      timeoutMs: number;
    };
    lmuShm: {
      pollIntervalMs: number;
      shmDir: string;
    };
    mock: {
      tickIntervalMs: number;
      carCount: number;
    };
  };
  ui: {
    theme: string;
    leaderboard: {
      maxRows: number;
      showClassBadge: boolean;
      showBestLap: boolean;
      gapMode: 'interval' | 'leader';
    };
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export function loadConfig(argv: string[] = process.argv.slice(2)): AppConfig {
  const defaultPath = path.join(PROJECT_ROOT, 'config', 'default.json');
  const raw = fs.readFileSync(defaultPath, 'utf-8');
  const config = JSON.parse(raw) as AppConfig;

  if (process.env.BESTLAP_HOST) {
    config.server.host = process.env.BESTLAP_HOST;
  }
  if (process.env.BESTLAP_PORT) {
    const parsed = Number(process.env.BESTLAP_PORT);
    if (Number.isFinite(parsed) && parsed > 0) {
      config.server.port = parsed;
    }
  }
  if (process.env.LMU_REST_URL) {
    config.telemetry.lmuRest.baseUrl = process.env.LMU_REST_URL;
  }

  for (const arg of argv) {
    if (arg.startsWith('--provider=')) {
      const val = arg.slice('--provider='.length);
      if (val === 'auto' || val === 'lmu-rest' || val === 'lmu-shm' || val === 'mock') {
        config.telemetry.provider = val;
      }
    } else if (arg === '--mock') {
      config.telemetry.provider = 'mock';
    } else if (arg.startsWith('--port=')) {
      const port = Number(arg.slice('--port='.length));
      if (Number.isFinite(port) && port > 0) {
        config.server.port = port;
      }
    }
  }

  return config;
}
