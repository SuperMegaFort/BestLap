import dgram from 'node:dgram';
import type { PlayerInputs, TireCornerTelemetry, VehicleTelemetry } from '../core/types.ts';

export interface UdpBridgePayload {
  timestamp: number;
  playerInputs: PlayerInputs;
  fuelLiters: number;
  fuelCapacity: number;
  tires: {
    fl: TireCornerTelemetry;
    fr: TireCornerTelemetry;
    rl: TireCornerTelemetry;
    rr: TireCornerTelemetry;
  };
}

interface RawUdpBridgeJson {
  throttle?: number;
  brake?: number;
  clutch?: number;
  steering?: number;
  gear?: number;
  speedKmh?: number;
  rpm?: number;
  maxRpm?: number;
  fuelLiters?: number;
  fuelCapacity?: number;
  tires?: Array<{
    wearPct?: number;
    tempSurfaceC?: number;
    tempCoreC?: number;
  }>;
}

export function parseUdpBridgePacket(msg: Buffer): UdpBridgePayload | null {
  try {
    const raw = JSON.parse(msg.toString('utf8')) as RawUdpBridgeJson;
    if (typeof raw !== 'object' || raw === null) return null;

    const clamp01 = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

    const makeTire = (idx: number): TireCornerTelemetry => {
      const t = raw.tires?.[idx];
      return {
        wearPct:
          typeof t?.wearPct === 'number' && Number.isFinite(t.wearPct)
            ? Number(Math.max(0, Math.min(100, t.wearPct)).toFixed(1))
            : null,
        tempSurfaceC:
          typeof t?.tempSurfaceC === 'number' && Number.isFinite(t.tempSurfaceC)
            ? Math.round(t.tempSurfaceC)
            : null,
        tempCoreC:
          typeof t?.tempCoreC === 'number' && Number.isFinite(t.tempCoreC)
            ? Math.round(t.tempCoreC)
            : null,
        compound: 'UNKNOWN',
      };
    };

    return {
      timestamp: Date.now(),
      playerInputs: {
        throttle: clamp01(raw.throttle),
        brake: clamp01(raw.brake),
        clutch: clamp01(raw.clutch),
        steeringAngle:
          typeof raw.steering === 'number' && Number.isFinite(raw.steering)
            ? Math.max(-1, Math.min(1, raw.steering))
            : 0,
        gear: typeof raw.gear === 'number' && Number.isFinite(raw.gear) ? Math.trunc(raw.gear) : 0,
        speedKmh:
          typeof raw.speedKmh === 'number' && Number.isFinite(raw.speedKmh)
            ? Math.round(Math.max(0, raw.speedKmh))
            : 0,
        rpm: typeof raw.rpm === 'number' && Number.isFinite(raw.rpm) ? Math.round(Math.max(0, raw.rpm)) : 0,
        maxRpm:
          typeof raw.maxRpm === 'number' && Number.isFinite(raw.maxRpm) && raw.maxRpm > 500
            ? Math.round(raw.maxRpm)
            : 8500,
      },
      fuelLiters:
        typeof raw.fuelLiters === 'number' && Number.isFinite(raw.fuelLiters)
          ? Number(Math.max(0, raw.fuelLiters).toFixed(2))
          : 0,
      fuelCapacity:
        typeof raw.fuelCapacity === 'number' && Number.isFinite(raw.fuelCapacity) && raw.fuelCapacity > 0
          ? Number(raw.fuelCapacity.toFixed(1))
          : 90,
      tires: {
        fl: makeTire(0),
        fr: makeTire(1),
        rl: makeTire(2),
        rr: makeTire(3),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Listens on 127.0.0.1:20778 for 60Hz telemetry packets sent by the Wine/Proton SHM bridge.
 */
export class LmuUdpReceiver {
  private readonly host: string;
  private readonly port: number;
  private socket: dgram.Socket | null = null;
  private latest: UdpBridgePayload | null = null;

  constructor(host = '127.0.0.1', port = 20778) {
    this.host = host;
    this.port = port;
  }

  start(): void {
    if (this.socket) return;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('message', (msg) => {
      const parsed = parseUdpBridgePacket(msg);
      if (parsed) {
        this.latest = parsed;
      }
    });
    this.socket.on('error', () => {
      // Non-fatal if port is busy; REST fallback still works
    });
    this.socket.bind(this.port, this.host);
  }

  stop(): void {
    if (!this.socket) return;
    try {
      this.socket.close();
    } catch {
      // Ignore close error
    }
    this.socket = null;
  }

  getLatestIfFresh(maxAgeMs = 1500): UdpBridgePayload | null {
    if (!this.latest) return null;
    if (Date.now() - this.latest.timestamp > maxAgeMs) return null;
    return this.latest;
  }

  mergeIntoVehicleTelemetry(base: VehicleTelemetry): VehicleTelemetry {
    const fresh = this.getLatestIfFresh();
    if (!fresh) return base;

    const compound = base.tires.fl.compound;
    return {
      ...base,
      tires: {
        fl: { ...fresh.tires.fl, compound },
        fr: { ...fresh.tires.fr, compound },
        rl: { ...fresh.tires.rl, compound },
        rr: { ...fresh.tires.rr, compound },
      },
      fuel: {
        ...base.fuel,
        levelLiters: fresh.fuelLiters,
        capacityLiters: fresh.fuelCapacity,
      },
    };
  }
}
