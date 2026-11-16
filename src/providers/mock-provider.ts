import type { DriverRank, PitStatus, PlayerInputs, StandingsEntry, TelemetryFrame, TireCompound, VehicleClass, VehicleTelemetry } from '../core/types.ts';
import type { TelemetryProvider, TelemetryProviderCallbacks } from './base-provider.ts';

interface SimCar {
  id: string;
  carNumber: string;
  driverName: string;
  teamName: string;
  carName: string;
  vehicleClass: VehicleClass;
  isPlayer: boolean;
  baseLapMs: number;
  tireCompound: TireCompound;
  driverRank: DriverRank;
  positionDelta: number;
  lapProgress: number;
  lapsCompleted: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  pitStatus: PitStatus;
  pitStops: number;
  pitTimerTicks: number;
  totalElapsedMs: number;
}

const MOCK_GRID: Array<Omit<SimCar, 'lapProgress' | 'lapsCompleted' | 'lastLapMs' | 'bestLapMs' | 'pitStatus' | 'pitStops' | 'pitTimerTicks' | 'totalElapsedMs'>> = [
  { id: '50', carNumber: '50', driverName: 'A. Fuoco', teamName: 'Ferrari AF Corse', carName: 'Ferrari 499P', vehicleClass: 'HYPERCAR', isPlayer: false, baseLapMs: 204_850, tireCompound: 'SOFT', driverRank: 'PLATINUM', positionDelta: 2 },
  { id: '8', carNumber: '8', driverName: 'S. Buemi', teamName: 'Toyota Gazoo Racing', carName: 'Toyota GR010 Hybrid', vehicleClass: 'HYPERCAR', isPlayer: false, baseLapMs: 205_120, tireCompound: 'MEDIUM', driverRank: 'PLATINUM', positionDelta: 5 },
  { id: '6', carNumber: '6', driverName: 'K. Estre', teamName: 'Porsche Penske', carName: 'Porsche 963', vehicleClass: 'HYPERCAR', isPlayer: true, baseLapMs: 205_340, tireCompound: 'MEDIUM', driverRank: 'PLATINUM', positionDelta: -2 },
  { id: '51', carNumber: '51', driverName: 'A. Pier Guidi', teamName: 'Ferrari AF Corse', carName: 'Ferrari 499P', vehicleClass: 'HYPERCAR', isPlayer: false, baseLapMs: 205_790, tireCompound: 'HARD', driverRank: 'PLATINUM', positionDelta: 0 },
  { id: '2', carNumber: '2', driverName: 'E. Bamber', teamName: 'Cadillac Racing', carName: 'Cadillac V-Series.R', vehicleClass: 'HYPERCAR', isPlayer: false, baseLapMs: 206_110, tireCompound: 'MEDIUM', driverRank: 'PLATINUM', positionDelta: 0 },
  { id: '7', carNumber: '7', driverName: 'K. Kobayashi', teamName: 'Toyota Gazoo Racing', carName: 'Toyota GR010 Hybrid', vehicleClass: 'HYPERCAR', isPlayer: false, baseLapMs: 206_450, tireCompound: 'SOFT', driverRank: 'PLATINUM', positionDelta: 1 },
  { id: '36', carNumber: '36', driverName: 'N. Lapierre', teamName: 'Alpine Endurance', carName: 'Alpine A424', vehicleClass: 'HYPERCAR', isPlayer: false, baseLapMs: 207_200, tireCompound: 'HARD', driverRank: 'GOLD', positionDelta: -1 },
  { id: '22', carNumber: '22', driverName: 'F. Albuquerque', teamName: 'United Autosports', carName: 'Oreca 07 Gibson', vehicleClass: 'LMP2', isPlayer: false, baseLapMs: 214_900, tireCompound: 'MEDIUM', driverRank: 'PLATINUM', positionDelta: 2 },
  { id: '34', carNumber: '34', driverName: 'J. Smiechowski', teamName: 'Inter Europol', carName: 'Oreca 07 Gibson', vehicleClass: 'LMP2', isPlayer: false, baseLapMs: 215_320, tireCompound: 'SOFT', driverRank: 'SILVER', positionDelta: 3 },
  { id: '10', carNumber: '10', driverName: 'R. Cullen', teamName: 'Vector Sport', carName: 'Oreca 07 Gibson', vehicleClass: 'LMP2', isPlayer: false, baseLapMs: 215_890, tireCompound: 'MEDIUM', driverRank: 'SILVER', positionDelta: -1 },
  { id: '37', carNumber: '37', driverName: 'M. Jakobsen', teamName: 'COOL Racing', carName: 'Oreca 07 Gibson', vehicleClass: 'LMP2', isPlayer: false, baseLapMs: 216_400, tireCompound: 'HARD', driverRank: 'GOLD', positionDelta: 0 },
  { id: '92', carNumber: '92', driverName: 'K. Bachler', teamName: 'Manthey PureRxcing', carName: 'Porsche 911 GT3 R', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 235_400, tireCompound: 'SOFT', driverRank: 'GOLD', positionDelta: 2 },
  { id: '31', carNumber: '31', driverName: 'A. Farfus', teamName: 'Team WRT', carName: 'BMW M4 GT3', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 235_880, tireCompound: 'MEDIUM', driverRank: 'PLATINUM', positionDelta: 5 },
  { id: '54', carNumber: '54', driverName: 'D. Rigon', teamName: 'Vista AF Corse', carName: 'Ferrari 296 GT3', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 236_250, tireCompound: 'MEDIUM', driverRank: 'PLATINUM', positionDelta: -2 },
  { id: '27', carNumber: '27', driverName: 'A. Riberas', teamName: 'Heart of Racing', carName: 'Aston Martin Vantage', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 236_910, tireCompound: 'WET', driverRank: 'GOLD', positionDelta: 0 },
  { id: '85', carNumber: '85', driverName: 'M. Gatting', teamName: 'Iron Dames', carName: 'Lamborghini Huracan', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 237_300, tireCompound: 'HARD', driverRank: 'GOLD', positionDelta: 0 },
  { id: '81', carNumber: '81', driverName: 'C. Eastwood', teamName: 'TF Sport', carName: 'Corvette Z06 GT3.R', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 237_750, tireCompound: 'MEDIUM', driverRank: 'GOLD', positionDelta: 1 },
  { id: '46', carNumber: '46', driverName: 'V. Rossi', teamName: 'Team WRT', carName: 'BMW M4 GT3', vehicleClass: 'LMGT3', isPlayer: false, baseLapMs: 238_100, tireCompound: 'SOFT', driverRank: 'SILVER', positionDelta: -1 },
];

export interface MockProviderOptions {
  tickIntervalMs: number;
  carCount: number;
}

/**
 * Simulates a live WEC multi-class race at Circuit de la Sarthe for UI development & testing.
 */
export class MockTelemetryProvider implements TelemetryProvider {
  readonly name = 'mock';
  private readonly options: MockProviderOptions;
  private timer: NodeJS.Timeout | null = null;
  private callbacks: TelemetryProviderCallbacks | null = null;
  private cars: SimCar[] = [];
  private sessionRemainingSec = 2 * 3600 + 42 * 60 + 15;
  private tickCount = 0;

  constructor(options: MockProviderOptions) {
    this.options = options;
    const count = Math.max(3, Math.min(MOCK_GRID.length, options.carCount));
    this.cars = MOCK_GRID.slice(0, count).map((template, idx) => {
      const initialLap = 14 - Math.floor(idx / 6);
      const initialPct = Math.max(0.05, 0.88 - idx * 0.045);
      const bestLapMs = template.baseLapMs - Math.floor(Math.random() * 400);
      return {
        ...template,
        lapsCompleted: initialLap,
        lapProgress: initialPct,
        lastLapMs: template.baseLapMs + Math.floor((Math.random() - 0.5) * 900),
        bestLapMs,
        pitStatus: idx === 5 ? 'PIT_LANE' : 'ON_TRACK',
        pitStops: idx < 8 ? 1 : 0,
        pitTimerTicks: idx === 5 ? 45 : 0,
        totalElapsedMs: initialLap * template.baseLapMs + initialPct * template.baseLapMs,
      };
    });
  }

  async start(callbacks: TelemetryProviderCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.callbacks.onStatus?.('connected', 'Mock WEC Le Mans telemetry active');
    this.emitTick();
    this.timer = setInterval(() => this.emitTick(), this.options.tickIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks?.onStatus?.('disconnected');
  }

  private emitTick(): void {
    if (!this.callbacks) return;
    this.tickCount++;
    const dtMs = this.options.tickIntervalMs;
    this.sessionRemainingSec = Math.max(0, this.sessionRemainingSec - dtMs / 1000);

    for (const car of this.cars) {
      if (car.pitStatus === 'PIT_LANE') {
        car.pitTimerTicks--;
        if (car.pitTimerTicks <= 0) {
          car.pitStatus = 'ON_TRACK';
          car.pitStops += 1;
        }
        continue;
      }

      // Subtle pace jitter so gaps evolve naturally
      const jitter = 1 + Math.sin((this.tickCount + Number(car.carNumber)) * 0.05) * 0.004;
      const stepPct = (dtMs / car.baseLapMs) * jitter;
      car.lapProgress += stepPct;
      car.totalElapsedMs += dtMs;

      if (car.lapProgress >= 1) {
        car.lapProgress -= 1;
        car.lapsCompleted += 1;
        const lapTime = Math.round(car.baseLapMs + (Math.random() - 0.5) * 1100);
        car.lastLapMs = lapTime;
        if (car.bestLapMs === null || lapTime < car.bestLapMs) {
          car.bestLapMs = lapTime;
        }
        // Occasional realistic pit stop trigger
        if (car.lapsCompleted % 11 === 0 && Math.random() < 0.35) {
          car.pitStatus = 'PIT_LANE';
          car.pitTimerTicks = 80;
        }
      }
    }

    const sorted = [...this.cars].sort((a, b) => {
      if (b.lapsCompleted !== a.lapsCompleted) {
        return b.lapsCompleted - a.lapsCompleted;
      }
      return b.lapProgress - a.lapProgress;
    });

    const leader = sorted[0];
    const leaderProgress = leader.lapsCompleted + leader.lapProgress;

    const standings: StandingsEntry[] = sorted.map((car, index) => {
      const carProgress = car.lapsCompleted + car.lapProgress;
      const leaderGapLaps = leaderProgress - carProgress;
      const gapToLeaderMs = index === 0 ? 0 : Math.round(leaderGapLaps * car.baseLapMs);

      let intervalMs = 0;
      if (index > 0) {
        const ahead = sorted[index - 1];
        const aheadProgress = ahead.lapsCompleted + ahead.lapProgress;
        intervalMs = Math.max(120, Math.round((aheadProgress - carProgress) * car.baseLapMs));
      }

      return {
        id: car.id,
        position: index + 1,
        classPosition: 0,
        positionDelta: car.positionDelta,
        carNumber: car.carNumber,
        driverName: car.driverName,
        teamName: car.teamName,
        carName: car.carName,
        vehicleClass: car.vehicleClass,
        isPlayer: car.isPlayer,
        lapsCompleted: car.lapsCompleted,
        lastLapMs: car.lastLapMs,
        bestLapMs: car.bestLapMs,
        sector1Ms: car.lastLapMs ? Math.round(car.lastLapMs * 0.31) : null,
        sector2Ms: car.lastLapMs ? Math.round(car.lastLapMs * 0.39) : null,
        sector3Ms: car.lastLapMs ? Math.round(car.lastLapMs * 0.30) : null,
        gapToLeaderMs,
        intervalMs,
        lapsDown: Math.max(0, leader.lapsCompleted - car.lapsCompleted),
        pitStatus: car.pitStatus,
        pitStops: car.pitStops,
        pitTimeSec: car.pitStatus === 'PIT_LANE' ? Math.max(1, Math.round(car.pitTimerTicks / 2)) : null,
        lapDistancePct: Number(car.lapProgress.toFixed(4)),
        tireCompound: car.tireCompound,
        energyPct: Math.max(8, Math.round(92 - ((Number(car.carNumber) * 3 + this.tickCount * 0.03) % 72))),
        driverRank: car.driverRank,
      };
    });

    const carInputsById: Record<string, PlayerInputs> = {};
    const carTelemetryById: Record<string, VehicleTelemetry> = {};

    for (const car of this.cars) {
      const offset = Number(car.carNumber) * 7;
      const carPhase = ((this.tickCount + offset) % 160) / 160;
      const braking = carPhase > 0.65 && carPhase < 0.82;
      const cornering = carPhase >= 0.72 && carPhase < 0.92;
      const downshift = carPhase > 0.68 && carPhase < 0.72;
      const t = braking ? 0 : cornering ? 0.45 + Math.sin(carPhase * 24) * 0.2 : 1;
      const b = braking ? Math.min(1, Math.sin(((carPhase - 0.65) / 0.17) * Math.PI) * 0.95) : 0;
      const c = downshift ? 0.75 : 0;
      const spd = Math.round(braking ? 135 : cornering ? 165 : 295 + Math.sin(carPhase * Math.PI) * 32);
      const gr = spd < 145 ? 3 : spd < 190 ? 4 : spd < 245 ? 5 : 6;
      carInputsById[car.id] = {
        throttle: Number(Math.max(0, Math.min(1, t)).toFixed(2)),
        brake: Number(b.toFixed(2)),
        clutch: c,
        steeringAngle: cornering ? Number((Math.sin(carPhase * 18) * 0.55).toFixed(2)) : 0,
        gear: gr,
        speedKmh: spd,
        rpm: Math.round(5200 + (spd % 55) * 60 + t * 1100),
        maxRpm: 8500,
      };

      const fuelBurnCar = ((this.tickCount * 0.0028) + Number(car.carNumber) * 0.4) % 62;
      const fuelLevelCar = Math.max(4.5, 74.0 - fuelBurnCar);
      const perLapCar = car.vehicleClass === 'HYPERCAR' ? 4.65 : car.vehicleClass === 'LMP2' ? 4.1 : 3.45;
      const wearBaseCar = Math.max(35, 95 - ((this.tickCount * 0.012 + Number(car.carNumber) * 0.7) % 48));
      const tempBumpCar = braking || cornering ? 6 : 0;
      const energyCar = Math.max(8, Number((92 - ((Number(car.carNumber) * 3 + this.tickCount * 0.03) % 72)).toFixed(1)));

      carTelemetryById[car.id] = {
        tires: {
          fl: { wearPct: Number((wearBaseCar - 3.2).toFixed(1)), tempSurfaceC: 84 + tempBumpCar, tempCoreC: 81, compound: car.tireCompound },
          fr: { wearPct: Number((wearBaseCar - 1.5).toFixed(1)), tempSurfaceC: 81 + tempBumpCar, tempCoreC: 79, compound: car.tireCompound },
          rl: { wearPct: Number((wearBaseCar - 2.4).toFixed(1)), tempSurfaceC: 86 + tempBumpCar, tempCoreC: 83, compound: car.tireCompound },
          rr: { wearPct: Number(wearBaseCar.toFixed(1)), tempSurfaceC: 83 + tempBumpCar, tempCoreC: 80, compound: car.tireCompound },
        },
        fuel: {
          levelLiters: Number(fuelLevelCar.toFixed(2)),
          capacityLiters: 90,
          perLapLiters: perLapCar,
          lapsRemaining: Number((fuelLevelCar / perLapCar).toFixed(1)),
          targetDeltaLiters: Number((fuelLevelCar - 45.0).toFixed(2)),
          virtualEnergyPct: energyCar,
        },
        weather: {
          trackTempC: 27,
          airTempC: 21,
          humidityPct: 54,
          trackCondition: 'DRY',
          gripPct: 98,
        },
      };
    }

    const playerCar = this.cars.find((c) => c.isPlayer) ?? this.cars[0];
    const playerInputs = carInputsById[playerCar.id];
    const vehicleTelemetry = carTelemetryById[playerCar.id];

    const frame: TelemetryFrame = {
      timestamp: Date.now(),
      provider: this.name,
      status: 'connected',
      session: {
        sim: 'mock',
        trackName: 'Circuit de la Sarthe (Le Mans)',
        sessionType: 'RACE',
        sessionTimeRemainingSec: Math.round(this.sessionRemainingSec),
        sessionTotalTimeSec: 6 * 3600,
        currentLap: leader.lapsCompleted + 1,
        totalLaps: null,
        trackTempC: 27,
        ambientTempC: 21,
        flagState: 'GREEN',
      },
      standings,
      overallBestLapMs: null,
      classBestLapMs: {},
      classSof: {
        HYPERCAR: 2822,
        LMP2: 2660,
        LMGT3: 2448,
      },
      playerInputs,
      carInputsById,
      vehicleTelemetry,
      carTelemetryById,
    };

    this.callbacks.onFrame(frame);
  }
}
