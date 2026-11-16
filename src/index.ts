import path from 'node:path';
import { loadConfig, PROJECT_ROOT, type AppConfig } from './core/config.ts';
import { TelemetryHub } from './core/telemetry-hub.ts';
import { OverlayServer } from './core/ws-server.ts';
import { getLinuxEnvironment } from './platform/linux-paths.ts';
import type { TelemetryProvider } from './providers/base-provider.ts';
import { LmuRestProvider } from './providers/lmu-rest-provider.ts';
import { LmuShmProvider } from './providers/lmu-shm-provider.ts';
import { MockTelemetryProvider } from './providers/mock-provider.ts';

function createProvider(config: AppConfig): TelemetryProvider {
  switch (config.telemetry.provider) {
    case 'mock':
      return new MockTelemetryProvider(config.telemetry.mock);
    case 'lmu-shm':
      return new LmuShmProvider(config.telemetry.lmuShm);
    case 'lmu-rest':
    case 'auto':
    default:
      return new LmuRestProvider(config.telemetry.lmuRest);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const linuxEnv = getLinuxEnvironment();
  const hub = new TelemetryHub(config.server.broadcastHz);
  const uiDir = path.join(PROJECT_ROOT, 'ui');

  const server = new OverlayServer({
    host: config.server.host,
    port: config.server.port,
    uiDir,
    getInitialPayload: () => hub.getLatestFrame(),
    onClientMessage: (msg) => {
      if (msg && typeof msg === 'object' && 'type' in msg && msg.type === 'set-focus') {
        const driverId = 'driverId' in msg && typeof msg.driverId === 'string' ? msg.driverId : null;
        hub.setFocusedDriver(driverId);
      }
    },
  });

  hub.subscribe((frame) => {
    server.broadcastJson(frame);
  });

  const { host, port } = await server.start();
  const provider = createProvider(config);

  console.log(`[BestLap] Server listening on http://${host}:${port}`);
  console.log(`[BestLap] Standalone Leaderboard: http://${host}:${port}/widgets/leaderboard.html`);
  console.log(
    `[BestLap] Platform=${linuxEnv.platform} Display=${linuxEnv.displayServer} Provider=${provider.name}`
  );
  if (linuxEnv.lmuPrefixPath) {
    console.log(`[BestLap] Detected LMU Proton prefix: ${linuxEnv.lmuPrefixPath}`);
  }

  await provider.start({
    onFrame: (frame) => hub.publish(frame),
    onStatus: (status, message) => {
      console.log(`[Telemetry:${provider.name}] ${status}${message ? ` — ${message}` : ''}`);
    },
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[BestLap] Received ${signal}, shutting down...`);
    await provider.stop();
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[BestLap] Fatal error:', err);
  process.exit(1);
});
