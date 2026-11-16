import fs from 'node:fs';
import path from 'node:path';
import type {
  PlayerInputs,
  SessionType,
  TelemetryFrame,
  TireCornerTelemetry,
  VehicleTelemetry,
} from '../core/types.ts';
import type { TelemetryProvider, TelemetryProviderCallbacks } from './base-provider.ts';

export interface LmuShmProviderOptions {
  shmDir: string;
  pollIntervalMs: number;
}

const SCORING_CANDIDATES = [
  '$rFactor2SMMP_Scoring$',
  'rFactor2SMMP_Scoring',
  '__wine_rFactor2SMMP_Scoring',
];

const TELEMETRY_CANDIDATES = [
  '$rFactor2SMMP_Telemetry$',
  'rFactor2SMMP_Telemetry',
  '__wine_rFactor2SMMP_Telemetry',
];

function readCString(view: DataView, offset: number, maxLen: number): string {
  const bytes: number[] = [];
  const limit = Math.min(view.byteLength, offset + maxLen);
  for (let i = offset; i < limit; i++) {
    const b = view.getUint8(i);
    if (b === 0) break;
    bytes.push(b);
  }
  return Buffer.from(bytes).toString('utf8').trim();
}

function mapShmSession(sessionCode: number): SessionType {
  if (sessionCode >= 1 && sessionCode <= 4) return 'PRACTICE';
  if (sessionCode >= 5 && sessionCode <= 8) return 'QUALIFYING';
  if (sessionCode === 9) return 'WARMUP';
  if (sessionCode >= 10 && sessionCode <= 13) return 'RACE';
  return 'UNKNOWN';
}

function kelvinToCelsius(k: number): number {
  if (!Number.isFinite(k) || k < 100) return 0;
  return Math.round(k - 273.15);
}

/**
 * Parses a single rF2VehicleTelemetry struct block (for the player car) from `$rFactor2SMMP_Telemetry$`.
 * Standard rF2SMMP v3 offsets relative to the start of the first vehicle record.
 */
export function parseRfactor2VehicleTelemetry(
  view: DataView,
  vehicleOffset = 16
): { playerInputs: PlayerInputs; vehicleTelemetry: VehicleTelemetry } | null {
  // rF2VehicleTelemetry is 1888 bytes under #pragma pack(4)
  if (view.byteLength < vehicleOffset + 1888) {
    return null;
  }

  const velX = view.getFloat64(vehicleOffset + 184, true);
  const velY = view.getFloat64(vehicleOffset + 192, true);
  const velZ = view.getFloat64(vehicleOffset + 200, true);
  const speedKmh = Math.round(Math.hypot(velX, velY, velZ) * 3.6);

  const gear = view.getInt32(vehicleOffset + 352, true);
  const rpm = view.getFloat64(vehicleOffset + 356, true);
  const maxRpm = view.getFloat64(vehicleOffset + 532, true);

  const throttle = Math.max(0, Math.min(1, view.getFloat64(vehicleOffset + 388, true)));
  const brake = Math.max(0, Math.min(1, view.getFloat64(vehicleOffset + 396, true)));
  const steeringAngle = Math.max(-1, Math.min(1, view.getFloat64(vehicleOffset + 404, true)));
  const clutch = Math.max(0, Math.min(1, view.getFloat64(vehicleOffset + 412, true)));

  const fuelLiters = Math.max(0, view.getFloat64(vehicleOffset + 524, true));
  const fuelCapacity = Math.max(1, view.getFloat64(vehicleOffset + 608, true));

  const readWheel = (wheelIdx: number): TireCornerTelemetry => {
    const wOff = vehicleOffset + 848 + wheelIdx * 260;
    const surfK = view.getFloat64(wOff + 136, true); // mTemperature[1]
    const wear = view.getFloat64(wOff + 152, true); // mWear
    const coreK = view.getFloat64(wOff + 204, true); // mTireCarcassTemperature
    return {
      wearPct: Number((Math.max(0, Math.min(1, wear)) * 100).toFixed(1)),
      tempSurfaceC: kelvinToCelsius(surfK),
      tempCoreC: coreK > 100 ? kelvinToCelsius(coreK) : kelvinToCelsius(surfK),
      compound: 'UNKNOWN',
    };
  };

  return {
    playerInputs: {
      throttle,
      brake,
      clutch,
      steeringAngle,
      gear,
      speedKmh,
      rpm: Math.round(Math.max(0, rpm)),
      maxRpm: Math.round(maxRpm > 1000 ? maxRpm : 8500),
    },
    vehicleTelemetry: {
      tires: {
        fl: readWheel(0),
        fr: readWheel(1),
        rl: readWheel(2),
        rr: readWheel(3),
      },
      fuel: {
        levelLiters: Number(fuelLiters.toFixed(2)),
        capacityLiters: Number(fuelCapacity.toFixed(1)),
        perLapLiters: 0,
        lapsRemaining: null,
        targetDeltaLiters: null,
        virtualEnergyPct: null,
      },
      weather: {
        trackTempC: 25,
        airTempC: 20,
        humidityPct: 50,
        trackCondition: 'DRY',
        gripPct: 98,
      },
    },
  };
}

/**
 * Reads rF2 / LMU Shared Memory mapped files in `/dev/shm` (via Wine/Proton shm bridge).
 * Supports both `$rFactor2SMMP_Scoring$` and `$rFactor2SMMP_Telemetry$`.
 */
export class LmuShmProvider implements TelemetryProvider {
  readonly name = 'lmu-shm';
  private readonly options: LmuShmProviderOptions;
  private timer: NodeJS.Timeout | null = null;
  private callbacks: TelemetryProviderCallbacks | null = null;
  private resolvedScoringFile: string | null = null;
  private resolvedTelemetryFile: string | null = null;

  constructor(options: LmuShmProviderOptions) {
    this.options = options;
  }

  async start(callbacks: TelemetryProviderCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.callbacks.onStatus?.('waiting', `Looking for LMU shared memory in ${this.options.shmDir}`);
    this.pollOnce();
    this.timer = setInterval(() => this.pollOnce(), this.options.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks?.onStatus?.('disconnected');
  }

  private findFile(candidates: string[], cached: string | null): string | null {
    if (cached && fs.existsSync(cached)) return cached;
    for (const candidate of candidates) {
      const fullPath = path.join(this.options.shmDir, candidate);
      if (fs.existsSync(fullPath)) return fullPath;
    }
    return null;
  }

  private readTelemetryBuffer(): { playerInputs: PlayerInputs; vehicleTelemetry: VehicleTelemetry } | null {
    this.resolvedTelemetryFile = this.findFile(TELEMETRY_CANDIDATES, this.resolvedTelemetryFile);
    if (!this.resolvedTelemetryFile) return null;
    try {
      const buf = fs.readFileSync(this.resolvedTelemetryFile);
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      if (view.byteLength < 16) return null;
      if (view.getUint32(0, true) !== view.getUint32(4, true)) return null;
      return parseRfactor2VehicleTelemetry(view, 16);
    } catch {
      return null;
    }
  }

  private pollOnce(): void {
    if (!this.callbacks) return;

    this.resolvedScoringFile = this.findFile(SCORING_CANDIDATES, this.resolvedScoringFile);
    if (!this.resolvedScoringFile) {
      this.callbacks.onFrame(this.createWaitingFrame());
      return;
    }

    try {
      const buffer = fs.readFileSync(this.resolvedScoringFile);
      if (buffer.byteLength < 128) {
        this.callbacks.onFrame(this.createWaitingFrame());
        return;
      }

      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const beginVer = view.getUint32(0, true);
      const endVer = view.getUint32(4, true);
      if (beginVer !== endVer) {
        return;
      }

      const trackName = readCString(view, 12, 64) || 'Le Mans Ultimate (SHM)';
      const sessionCode = view.getInt32(76, true);
      const currentET = view.getFloat64(80, true);
      const endET = view.getFloat64(88, true);
      const maxLaps = view.getInt32(96, true);
      const remainingSec = endET > 0 && endET > currentET ? endET - currentET : null;

      const tel = this.readTelemetryBuffer();

      this.callbacks.onStatus?.('connected', `Reading shared memory: ${path.basename(this.resolvedScoringFile)}`);
      this.callbacks.onFrame({
        timestamp: Date.now(),
        provider: this.name,
        status: 'connected',
        session: {
          sim: 'lmu',
          trackName,
          sessionType: mapShmSession(sessionCode),
          sessionTimeRemainingSec: remainingSec,
          sessionTotalTimeSec: endET > 0 ? endET : null,
          currentLap: 1,
          totalLaps: maxLaps > 0 && maxLaps < 10000 ? maxLaps : null,
          trackTempC: tel?.vehicleTelemetry.weather.trackTempC ?? null,
          ambientTempC: tel?.vehicleTelemetry.weather.airTempC ?? null,
          flagState: 'GREEN',
        },
        standings: [],
        overallBestLapMs: null,
        classBestLapMs: {},
        playerInputs: tel?.playerInputs,
        vehicleTelemetry: tel?.vehicleTelemetry,
      });
    } catch {
      this.callbacks.onFrame(this.createWaitingFrame());
    }
  }

  private createWaitingFrame(): TelemetryFrame {
    return {
      timestamp: Date.now(),
      provider: this.name,
      status: 'waiting',
      session: {
        sim: 'lmu',
        trackName: 'Waiting for /dev/shm LMU Shared Memory...',
        sessionType: 'UNKNOWN',
        sessionTimeRemainingSec: null,
        sessionTotalTimeSec: null,
        currentLap: 0,
        totalLaps: null,
        trackTempC: null,
        ambientTempC: null,
        flagState: 'GREEN',
      },
      standings: [],
      overallBestLapMs: null,
      classBestLapMs: {},
    };
  }
}
