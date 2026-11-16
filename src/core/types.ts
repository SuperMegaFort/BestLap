export type VehicleClass =
  | 'HYPERCAR'
  | 'LMP2'
  | 'LMP3'
  | 'LMGT3'
  | 'GTE'
  | 'UNKNOWN';

export type SessionType =
  | 'PRACTICE'
  | 'QUALIFYING'
  | 'WARMUP'
  | 'RACE'
  | 'UNKNOWN';

export type ConnectionStatus = 'connected' | 'waiting' | 'disconnected' | 'error';

export type PitStatus = 'ON_TRACK' | 'PIT_LANE' | 'IN_GARAGE' | 'FINISHED' | 'DNF';

export interface SessionInfo {
  sim: 'lmu' | 'rf2' | 'acc' | 'mock';
  trackName: string;
  sessionType: SessionType;
  sessionTimeRemainingSec: number | null;
  sessionTotalTimeSec: number | null;
  currentLap: number;
  totalLaps: number | null;
  trackTempC: number | null;
  ambientTempC: number | null;
  flagState: 'GREEN' | 'YELLOW' | 'FCY' | 'SC' | 'RED' | 'CHECKERED';
}

export type DriverRank = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE';

export interface StandingsEntry {
  id: string;
  position: number;
  classPosition: number;
  positionDelta: number; // + gained, - lost since start / previous lap
  carNumber: string;
  driverName: string;
  teamName: string;
  carName: string;
  vehicleClass: VehicleClass;
  isPlayer: boolean;
  lapsCompleted: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  sector1Ms: number | null;
  sector2Ms: number | null;
  sector3Ms: number | null;
  gapToLeaderMs: number | null;
  intervalMs: number | null;
  lapsDown: number;
  pitStatus: PitStatus;
  pitStops: number;
  pitTimeSec: number | null;
  lapDistancePct: number;
  worldPos?: { x: number; z: number } | null;
  tireCompound: TireCompound;
  energyPct?: number | null; // Virtual Energy / Hybrid battery %
  driverRank?: DriverRank | null;
}

export interface PlayerInputs {
  throttle: number; // 0..1
  brake: number; // 0..1
  clutch: number; // 0..1
  steeringAngle: number; // -1..1 (normalized)
  gear: number; // -1 = R, 0 = N, 1..8
  speedKmh: number;
  rpm: number;
  maxRpm: number;
}

export type TireCompound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTER' | 'WET' | 'UNKNOWN';
export type TrackCondition = 'DRY' | 'DAMP' | 'WET' | 'RAIN';

export interface TireCornerTelemetry {
  wearPct: number | null; // 0..100 (100 = brand new)
  tempSurfaceC: number | null;
  tempCoreC: number | null;
  compound: TireCompound;
}

export interface VehicleTelemetry {
  tires: {
    fl: TireCornerTelemetry;
    fr: TireCornerTelemetry;
    rl: TireCornerTelemetry;
    rr: TireCornerTelemetry;
  };
  fuel: {
    levelLiters: number;
    capacityLiters: number;
    perLapLiters: number;
    lapsRemaining: number | null;
    targetDeltaLiters: number | null; // + surplus, - deficit to finish
    virtualEnergyPct: number | null; // LMU Hypercar / LMGT3 virtual energy
  };
  weather: {
    trackTempC: number;
    airTempC: number;
    humidityPct: number;
    trackCondition: TrackCondition;
    gripPct: number;
  };
}

export interface TelemetryFrame {
  timestamp: number;
  provider: string;
  status: ConnectionStatus;
  session: SessionInfo;
  standings: StandingsEntry[];
  overallBestLapMs: number | null;
  classBestLapMs: Partial<Record<VehicleClass, number>>;
  classSof?: Partial<Record<VehicleClass, number>>;
  focusedDriverId?: string | null;
  playerInputs?: PlayerInputs;
  carInputsById?: Record<string, PlayerInputs>;
  vehicleTelemetry?: VehicleTelemetry;
  carTelemetryById?: Record<string, VehicleTelemetry>;
  trackMapPoints?: Array<{ x: number; z: number }>;
}

export interface ProviderStatusEvent {
  provider: string;
  status: ConnectionStatus;
  message?: string;
}
