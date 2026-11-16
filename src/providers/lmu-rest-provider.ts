import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../core/config.ts';
import type {
  DriverRank,
  PitStatus,
  PlayerInputs,
  SessionInfo,
  SessionType,
  StandingsEntry,
  TelemetryFrame,
  TireCompound,
  TrackCondition,
  VehicleClass,
  VehicleTelemetry,
} from '../core/types.ts';
import {
  findLmuProtonBinary,
  findSteamRoot,
  LMU_STEAM_APP_ID,
} from '../platform/linux-paths.ts';
import type { TelemetryProvider, TelemetryProviderCallbacks } from './base-provider.ts';
import { LmuUdpReceiver } from './lmu-udp-receiver.ts';

export interface LmuRestProviderOptions {
  baseUrl: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

interface LmuRawStanding {
  slotID?: number;
  driverName?: string;
  vehicleName?: string;
  fullTeamName?: string;
  carNumber?: string | number;
  carClass?: string;
  position?: number;
  classPosition?: number;
  lapsCompleted?: number;
  lastLapTime?: number;
  bestLapTime?: number;
  currentSectorTime1?: number;
  currentSectorTime2?: number;
  timeBehindLeader?: number;
  timeBehindNext?: number;
  lapsBehindLeader?: number;
  inControl?: number;
  player?: boolean;
  pitState?: string | number;
  pitting?: boolean;
  inGarageStall?: boolean;
  pitStops?: number;
  pitstops?: number;
  lapDistance?: number;
  carPosition?: { x?: number; y?: number; z?: number };
  carVelocity?: { velocity?: number; x?: number; y?: number; z?: number };
  carAcceleration?: { velocity?: number; x?: number; y?: number; z?: number };
  frontTireCompoundName?: string;
  tireCompound?: string;
  fuelFraction?: number;
  veFraction?: number;
  virtualEnergy?: number;
  driverRank?: string;
  finishStatus?: string;
}

interface LmuTrackPointRaw {
  type?: number;
  x?: number;
  z?: number;
}

interface LmuRawSessionInfo {
  trackName?: string;
  session?: string;
  lapDistance?: number;
  currentEventTime?: number;
  endEventTime?: number;
  maximumLaps?: number;
  trackTemp?: number;
  ambientTemp?: number;
  raining?: number;
  minPathWetness?: number;
  maxPathWetness?: number;
  yellowFlagState?: string;
}

export function mapVehicleClass(rawClass?: string): VehicleClass {
  const normalized = (rawClass ?? '').toUpperCase();
  if (normalized.includes('HYPER') || normalized.includes('LMH') || normalized.includes('LMDH')) {
    return 'HYPERCAR';
  }
  if (normalized.includes('LMP2')) return 'LMP2';
  if (normalized.includes('LMP3')) return 'LMP3';
  if (normalized.includes('LMGT3') || normalized.includes('GT3')) return 'LMGT3';
  if (normalized.includes('GTE')) return 'GTE';
  return 'UNKNOWN';
}

export function mapSessionType(rawSession?: string): SessionType {
  const normalized = (rawSession ?? '').toUpperCase();
  if (normalized.includes('RACE')) return 'RACE';
  if (normalized.includes('QUAL')) return 'QUALIFYING';
  if (normalized.includes('PRACT') || normalized.includes('TEST')) return 'PRACTICE';
  if (normalized.includes('WARM')) return 'WARMUP';
  return 'UNKNOWN';
}

function secondsToMs(sec?: number): number | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) {
    return null;
  }
  return Math.round(sec * 1000);
}

function mapPitStatus(raw: LmuRawStanding): PitStatus {
  if (raw.finishStatus === 'FINISHED') return 'FINISHED';
  if (raw.finishStatus === 'DNF' || raw.finishStatus === 'DQ') return 'DNF';
  if (raw.inGarageStall) return 'IN_GARAGE';
  if (raw.pitting || raw.pitState === 'PITTING' || raw.pitState === 2 || raw.pitState === 3) {
    return 'PIT_LANE';
  }
  return 'ON_TRACK';
}

function mapTireCompound(raw?: string): TireCompound {
  const s = (raw ?? '').toUpperCase();
  if (s.includes('SOFT')) return 'SOFT';
  if (s.includes('MED')) return 'MEDIUM';
  if (s.includes('HARD')) return 'HARD';
  if (s.includes('WET') || s.includes('RAIN')) return 'WET';
  if (s.includes('INTER')) return 'INTER';
  return 'MEDIUM';
}

function mapDriverRank(raw?: string): DriverRank | null {
  const s = (raw ?? '').toUpperCase();
  if (s.includes('PLAT')) return 'PLATINUM';
  if (s.includes('GOLD')) return 'GOLD';
  if (s.includes('SILV')) return 'SILVER';
  if (s.includes('BRONZ')) return 'BRONZE';
  return null;
}

function normalizeLapDistancePct(rawDist: number | undefined, trackLengthMeters: number): number {
  if (typeof rawDist !== 'number' || !Number.isFinite(rawDist) || rawDist < 0) return 0;
  if (trackLengthMeters > 100) {
    return ((rawDist % trackLengthMeters) + trackLengthMeters) % trackLengthMeters / trackLengthMeters;
  }
  if (rawDist <= 1) return rawDist;
  return 0;
}

/**
 * Pure mapper converting LMU REST API responses into a canonical TelemetryFrame.
 */
export interface LmuRepairAndRefuel {
  currentWeather?: {
    ambientTempKelvin?: number;
    trackTempKelvin?: number;
    humidity?: number;
    rainIntensity?: number;
    raining?: number;
  };
  fuelInfo?: {
    currentFuel?: number;
    maxFuel?: number;
    currentVirtualEnergy?: number;
    maxVirtualEnergy?: number;
    currentBattery?: number;
    maxBattery?: number;
  };
  wearables?: {
    tires?: number[];
  };
}

export function mapLmuRestToFrame(
  standingsRaw: LmuRawStanding[],
  sessionRaw: LmuRawSessionInfo | null,
  providerName = 'lmu-rest',
  extra?: {
    trackMapPoints?: Array<{ x: number; z: number }>;
    humidityPct?: number | null;
    repairAndRefuel?: LmuRepairAndRefuel | null;
  }
): TelemetryFrame {
  const maxRawDist = standingsRaw.reduce((m, s) => Math.max(m, s.lapDistance ?? 0), 0);
  const trackLengthMeters =
    typeof sessionRaw?.lapDistance === 'number' && sessionRaw.lapDistance > 100
      ? sessionRaw.lapDistance
      : maxRawDist > 100
        ? maxRawDist * 1.05
        : 0;

  const rrWeather = extra?.repairAndRefuel?.currentWeather;
  const trackTempC =
    typeof sessionRaw?.trackTemp === 'number'
      ? Math.round(sessionRaw.trackTemp)
      : typeof rrWeather?.trackTempKelvin === 'number'
        ? Math.round(rrWeather.trackTempKelvin - 273.15)
        : 25;
  const airTempC =
    typeof sessionRaw?.ambientTemp === 'number'
      ? Math.round(sessionRaw.ambientTemp)
      : typeof rrWeather?.ambientTempKelvin === 'number'
        ? Math.round(rrWeather.ambientTempKelvin - 273.15)
        : 20;
  const wetness = sessionRaw?.maxPathWetness ?? sessionRaw?.raining ?? rrWeather?.raining ?? 0;
  const trackCondition: TrackCondition =
    wetness > 0.6 ? 'RAIN' : wetness > 0.25 ? 'WET' : wetness > 0.05 ? 'DAMP' : 'DRY';
  const humidityPct =
    typeof extra?.humidityPct === 'number'
      ? Math.round(extra.humidityPct)
      : typeof rrWeather?.humidity === 'number'
        ? Math.round(rrWeather.humidity * 100)
        : Math.round(45 + wetness * 50);

  const carInputsById: Record<string, PlayerInputs> = {};
  const carTelemetryById: Record<string, VehicleTelemetry> = {};

  const standings: StandingsEntry[] = standingsRaw.map((item, idx) => {
    const id = String(item.slotID ?? item.carNumber ?? idx);
    const vehicleClass = mapVehicleClass(item.carClass);
    const pos = item.carPosition;
    const worldPos =
      pos && typeof pos.x === 'number' && typeof pos.z === 'number'
        ? { x: pos.x, z: pos.z }
        : null;

    const veRaw = item.veFraction ?? item.virtualEnergy;
    const energyPct =
      typeof veRaw === 'number'
        ? Math.round(veRaw <= 1 ? veRaw * 100 : veRaw)
        : typeof item.fuelFraction === 'number' && item.fuelFraction > 0
          ? Math.round(item.fuelFraction * 100)
          : null;

    const compound = mapTireCompound(item.frontTireCompoundName ?? item.tireCompound);
    const speedMs = item.carVelocity?.velocity ?? 0;
    const speedKmh = Math.round(Math.max(0, speedMs * 3.6));
    const accelMag = item.carAcceleration?.velocity ?? 0;

    // Derive approximate pedal activity from speed & acceleration when SHM pedals aren't mounted
    const isMoving = speedKmh > 3;
    const estThrottle = isMoving ? Math.min(1, Math.max(0.15, 0.55 + (accelMag > 0 ? 0.35 : -0.25))) : 0;
    const estBrake = isMoving && accelMag > 6 && speedKmh > 30 ? Math.min(1, (accelMag - 6) / 14) : 0;
    const estGear = !isMoving ? 0 : speedKmh < 75 ? 1 : speedKmh < 120 ? 2 : speedKmh < 165 ? 3 : speedKmh < 215 ? 4 : speedKmh < 260 ? 5 : 6;

    carInputsById[id] = {
      throttle: estBrake > 0.2 ? 0 : Number(estThrottle.toFixed(2)),
      brake: Number(estBrake.toFixed(2)),
      clutch: 0,
      steeringAngle: 0,
      gear: estGear,
      speedKmh,
      rpm: isMoving ? Math.min(8200, 3200 + (speedKmh % 60) * 80) : 1100,
      maxRpm: 8500,
    };

    const fuelPct = typeof item.fuelFraction === 'number' && item.fuelFraction > 0 ? item.fuelFraction : null;
    carTelemetryById[id] = {
      tires: {
        fl: { wearPct: null, tempSurfaceC: null, tempCoreC: null, compound },
        fr: { wearPct: null, tempSurfaceC: null, tempCoreC: null, compound },
        rl: { wearPct: null, tempSurfaceC: null, tempCoreC: null, compound },
        rr: { wearPct: null, tempSurfaceC: null, tempCoreC: null, compound },
      },
      fuel: {
        levelLiters: fuelPct !== null ? Number((fuelPct * 90).toFixed(1)) : 0,
        capacityLiters: 90,
        perLapLiters: 0,
        lapsRemaining: null,
        targetDeltaLiters: null,
        virtualEnergyPct: energyPct,
      },
      weather: {
        trackTempC,
        airTempC,
        humidityPct,
        trackCondition,
        gripPct: Math.round(100 - wetness * 25),
      },
    };

    return {
      id,
      position: item.position ?? idx + 1,
      classPosition: item.classPosition ?? 0,
      positionDelta: 0,
      carNumber: String(item.carNumber ?? idx + 1),
      driverName: item.driverName?.trim() || 'Unknown Driver',
      teamName: item.fullTeamName?.trim() || '',
      carName: item.vehicleName?.trim() || '',
      vehicleClass,
      isPlayer: Boolean(item.player || item.inControl === 1),
      lapsCompleted: item.lapsCompleted ?? 0,
      lastLapMs: secondsToMs(item.lastLapTime),
      bestLapMs: secondsToMs(item.bestLapTime),
      sector1Ms: secondsToMs(item.currentSectorTime1),
      sector2Ms: secondsToMs(item.currentSectorTime2),
      sector3Ms: null,
      gapToLeaderMs: item.position === 1 ? 0 : secondsToMs(item.timeBehindLeader),
      intervalMs: item.position === 1 ? 0 : secondsToMs(item.timeBehindNext),
      lapsDown: item.lapsBehindLeader ?? 0,
      pitStatus: mapPitStatus(item),
      pitStops: item.pitstops ?? item.pitStops ?? 0,
      pitTimeSec: null,
      lapDistancePct: Number(normalizeLapDistancePct(item.lapDistance, trackLengthMeters).toFixed(4)),
      worldPos,
      tireCompound: compound,
      energyPct,
      driverRank: mapDriverRank(item.driverRank),
    };
  });

  const endTime = sessionRaw?.endEventTime ?? null;
  const curTime = sessionRaw?.currentEventTime ?? null;
  const remainingSec =
    endTime !== null && curTime !== null && endTime > 0 ? Math.max(0, endTime - curTime) : null;

  const leaderLaps = standings.reduce((max, s) => Math.max(max, s.lapsCompleted), 0);
  const playerEntry = standings.find((s) => s.isPlayer) ?? standings[0];

  const session: SessionInfo = {
    sim: 'lmu',
    trackName: sessionRaw?.trackName?.trim() || 'Le Mans Ultimate',
    sessionType: mapSessionType(sessionRaw?.session),
    sessionTimeRemainingSec: remainingSec,
    sessionTotalTimeSec: endTime && endTime > 0 ? endTime : null,
    currentLap: leaderLaps + 1,
    totalLaps: sessionRaw?.maximumLaps && sessionRaw.maximumLaps > 0 && sessionRaw.maximumLaps < 10000
      ? sessionRaw.maximumLaps
      : null,
    trackTempC,
    ambientTempC: airTempC,
    flagState: 'GREEN',
  };

  if (playerEntry && extra?.repairAndRefuel && carTelemetryById[playerEntry.id]) {
    const rr = extra.repairAndRefuel;
    const playerTel = carTelemetryById[playerEntry.id];
    const tireWear = rr.wearables?.tires;
    if (Array.isArray(tireWear) && tireWear.length >= 4 && playerTel.tires) {
      const toPct = (v: number | undefined): number | null =>
        typeof v === 'number' && Number.isFinite(v)
          ? Number((Math.max(0, Math.min(1, v)) * 100).toFixed(1))
          : null;
      const fl = toPct(tireWear[0]);
      const fr = toPct(tireWear[1]);
      const rl = toPct(tireWear[2]);
      const rrPct = toPct(tireWear[3]);
      if (fl !== null) playerTel.tires.fl.wearPct = fl;
      if (fr !== null) playerTel.tires.fr.wearPct = fr;
      if (rl !== null) playerTel.tires.rl.wearPct = rl;
      if (rrPct !== null) playerTel.tires.rr.wearPct = rrPct;
    }

    const fuelInfo = rr.fuelInfo;
    if (fuelInfo && playerTel.fuel) {
      const maxFuel = typeof fuelInfo.maxFuel === 'number' && fuelInfo.maxFuel > 0 ? fuelInfo.maxFuel : null;
      const curFuelFrac = typeof fuelInfo.currentFuel === 'number' ? fuelInfo.currentFuel : null;
      if (maxFuel !== null) {
        playerTel.fuel.capacityLiters = Number(maxFuel.toFixed(1));
        if (curFuelFrac !== null) {
          // currentFuel in RepairAndRefuel is a 0..1 fraction of maxFuel
          const liters = curFuelFrac <= 1.0001 ? curFuelFrac * maxFuel : curFuelFrac;
          playerTel.fuel.levelLiters = Number(liters.toFixed(1));
        }
      }
      if (
        typeof fuelInfo.currentVirtualEnergy === 'number' &&
        typeof fuelInfo.maxVirtualEnergy === 'number' &&
        fuelInfo.maxVirtualEnergy > 0
      ) {
        playerTel.fuel.virtualEnergyPct = Number(
          ((fuelInfo.currentVirtualEnergy / fuelInfo.maxVirtualEnergy) * 100).toFixed(1)
        );
      }
    }
  }

  return {
    timestamp: Date.now(),
    provider: providerName,
    status: 'connected',
    session,
    standings,
    overallBestLapMs: null,
    classBestLapMs: {},
    playerInputs: playerEntry ? carInputsById[playerEntry.id] : undefined,
    carInputsById,
    vehicleTelemetry: playerEntry ? carTelemetryById[playerEntry.id] : undefined,
    carTelemetryById,
    trackMapPoints: extra?.trackMapPoints,
  };
}

/**
 * Connects to Le Mans Ultimate's built-in local REST API (default http://127.0.0.1:6397).
 * Works seamlessly across Proton/Wine boundaries on Linux via loopback.
 */
export class LmuRestProvider implements TelemetryProvider {
  readonly name = 'lmu-rest';
  private readonly options: LmuRestProviderOptions;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = false;
  private callbacks: TelemetryProviderCallbacks | null = null;
  private lastConnected = false;
  private cachedTrackName = '';
  private cachedTrackPoints: Array<{ x: number; z: number }> | undefined = undefined;
  private cachedHumidityPct: number | null = null;
  private lastWeatherPollTs = 0;
  private cachedRepairAndRefuel: LmuRepairAndRefuel | null = null;
  private lastRepairPollTs = 0;
  private readonly udpReceiver = new LmuUdpReceiver();
  private bridgeProcess: ChildProcess | null = null;
  private bridgeAttemptedForSession = false;

  constructor(options: LmuRestProviderOptions) {
    this.options = options;
  }

  async start(callbacks: TelemetryProviderCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.running = true;
    this.udpReceiver.start();
    this.callbacks.onStatus?.('waiting', `Polling LMU REST API at ${this.options.baseUrl}`);
    await this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.options.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopUdpBridge();
    this.udpReceiver.stop();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks?.onStatus?.('disconnected');
  }

  private ensureUdpBridgeRunning(): void {
    if (process.platform !== 'linux' || this.bridgeProcess || this.bridgeAttemptedForSession) {
      return;
    }
    if (this.udpReceiver.getLatestIfFresh()) {
      return;
    }

    const bridgeExe = path.join(PROJECT_ROOT, 'bridge', 'lmu_shm_bridge.exe');
    if (!fs.existsSync(bridgeExe)) {
      return;
    }

    const steamRoot = findSteamRoot();
    const protonBin = findLmuProtonBinary(steamRoot);
    if (!steamRoot || !protonBin) {
      return;
    }

    const compatDataPath = path.join(steamRoot, 'steamapps', 'compatdata', LMU_STEAM_APP_ID);
    this.bridgeAttemptedForSession = true;

    try {
      const child = spawn(protonBin, ['run', bridgeExe], {
        env: {
          ...process.env,
          STEAM_COMPAT_DATA_PATH: compatDataPath,
          STEAM_COMPAT_CLIENT_INSTALL_PATH: steamRoot,
        },
        stdio: 'ignore',
        detached: false,
      });

      child.on('exit', () => {
        if (this.bridgeProcess === child) {
          this.bridgeProcess = null;
        }
      });
      child.on('error', () => {
        if (this.bridgeProcess === child) {
          this.bridgeProcess = null;
        }
      });

      this.bridgeProcess = child;
      console.log(`[Telemetry:${this.name}] Auto-started Proton 60Hz SHM bridge`);
    } catch {
      this.bridgeProcess = null;
    }
  }

  private stopUdpBridge(): void {
    this.bridgeAttemptedForSession = false;
    if (!this.bridgeProcess) return;
    try {
      this.bridgeProcess.kill();
    } catch {
      // Ignore kill errors
    }
    this.bridgeProcess = null;
  }

  private async fetchJson<T>(endpoint: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const url = `${this.options.baseUrl.replace(/\/+$/, '')}${endpoint}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} on ${endpoint}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchTrackMapPoints(): Promise<Array<{ x: number; z: number }> | undefined> {
    try {
      const raw = await this.fetchJson<LmuTrackPointRaw[]>('/rest/watch/trackMap');
      if (!Array.isArray(raw)) return undefined;
      const mainTrack = raw.filter(
        (pt) => pt.type === 0 && typeof pt.x === 'number' && typeof pt.z === 'number'
      );
      if (mainTrack.length < 10) return undefined;
      // Downsample to ~180 points to keep WebSocket frames lightweight
      const step = Math.max(1, Math.floor(mainTrack.length / 180));
      const sampled: Array<{ x: number; z: number }> = [];
      for (let i = 0; i < mainTrack.length; i += step) {
        sampled.push({
          x: Number(mainTrack[i].x!.toFixed(1)),
          z: Number(mainTrack[i].z!.toFixed(1)),
        });
      }
      return sampled;
    } catch {
      return undefined;
    }
  }

  private async fetchHumidityPct(): Promise<number | null> {
    try {
      const weather = await this.fetchJson<Record<string, Record<string, { WNV_HUMIDITY?: { currentValue?: number } }>>>(
        '/rest/sessions/weather'
      );
      for (const sessionObj of Object.values(weather)) {
        for (const node of Object.values(sessionObj)) {
          const val = node?.WNV_HUMIDITY?.currentValue;
          if (typeof val === 'number') return val;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchRepairAndRefuel(): Promise<LmuRepairAndRefuel | null> {
    try {
      return await this.fetchJson<LmuRepairAndRefuel>('/rest/garage/UIScreen/RepairAndRefuel');
    } catch {
      return null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.running || this.inFlight || !this.callbacks) return;
    this.inFlight = true;

    try {
      const [standingsRaw, sessionRaw] = await Promise.all([
        this.fetchJson<LmuRawStanding[]>('/rest/watch/standings'),
        this.fetchJson<LmuRawSessionInfo>('/rest/watch/sessionInfo').catch(() => null),
      ]);

      if (!this.lastConnected) {
        this.lastConnected = true;
        this.callbacks.onStatus?.('connected', 'Connected to Le Mans Ultimate REST API');
        this.ensureUdpBridgeRunning();
      }

      const trackName = sessionRaw?.trackName?.trim() || '';
      if (trackName && trackName !== this.cachedTrackName) {
        this.cachedTrackName = trackName;
        this.cachedTrackPoints = await this.fetchTrackMapPoints();
      }

      const now = Date.now();
      if (now - this.lastWeatherPollTs > 5000) {
        this.lastWeatherPollTs = now;
        this.cachedHumidityPct = await this.fetchHumidityPct();
      }
      if (now - this.lastRepairPollTs >= 500) {
        this.lastRepairPollTs = now;
        this.cachedRepairAndRefuel = await this.fetchRepairAndRefuel();
      }

      const frame = mapLmuRestToFrame(
        Array.isArray(standingsRaw) ? standingsRaw : [],
        sessionRaw,
        this.name,
        {
          trackMapPoints: this.cachedTrackPoints,
          humidityPct: this.cachedHumidityPct,
          repairAndRefuel: this.cachedRepairAndRefuel,
        }
      );

      // Merge 60Hz Wine/Proton SHM UDP bridge data for the local player when active
      const freshUdp = this.udpReceiver.getLatestIfFresh();
      if (freshUdp) {
        const player = frame.standings.find((s) => s.isPlayer);
        if (player && frame.carInputsById && frame.carTelemetryById) {
          frame.carInputsById[player.id] = freshUdp.playerInputs;
          frame.playerInputs = freshUdp.playerInputs;
          const mergedTel = this.udpReceiver.mergeIntoVehicleTelemetry(
            frame.carTelemetryById[player.id]
          );
          frame.carTelemetryById[player.id] = mergedTel;
          frame.vehicleTelemetry = mergedTel;
        }
      }

      this.callbacks.onFrame(frame);
    } catch {
      if (this.lastConnected) {
        this.lastConnected = false;
        this.stopUdpBridge();
        this.callbacks.onStatus?.('waiting', 'Waiting for Le Mans Ultimate...');
      }
      this.callbacks.onFrame({
        timestamp: Date.now(),
        provider: this.name,
        status: 'waiting',
        session: {
          sim: 'lmu',
          trackName: 'Waiting for Le Mans Ultimate...',
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
      });
    } finally {
      this.inFlight = false;
    }
  }
}
