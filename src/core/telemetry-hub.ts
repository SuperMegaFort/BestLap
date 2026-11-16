import type { TelemetryFrame, VehicleClass } from './types.ts';

export type FrameListener = (frame: TelemetryFrame) => void;

/**
 * Central telemetry hub that normalizes standings metadata (best laps, class positions),
 * manages global focused-driver state, and throttles frame delivery to UI subscribers.
 */
export class TelemetryHub {
  private readonly minIntervalMs: number;
  private lastEmitTs = 0;
  private latestRawFrame: TelemetryFrame | null = null;
  private latestFrame: TelemetryFrame | null = null;
  private focusedDriverId: string | null = null;
  private listeners = new Set<FrameListener>();

  constructor(broadcastHz = 20) {
    this.minIntervalMs = Math.max(10, Math.floor(1000 / Math.max(1, broadcastHz)));
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    if (this.latestFrame) {
      listener(this.latestFrame);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  getLatestFrame(): TelemetryFrame | null {
    return this.latestFrame;
  }

  getFocusedDriverId(): string | null {
    return this.focusedDriverId;
  }

  setFocusedDriver(driverId: string | null): void {
    this.focusedDriverId = driverId || null;
    if (this.latestRawFrame) {
      const normalized = this.normalizeFrame(this.latestRawFrame);
      this.latestFrame = normalized;
      this.lastEmitTs = Date.now();
      for (const listener of this.listeners) {
        listener(normalized);
      }
    }
  }

  publish(frame: TelemetryFrame): void {
    this.latestRawFrame = frame;
    const normalized = this.normalizeFrame(frame);
    this.latestFrame = normalized;

    const now = Date.now();
    if (now - this.lastEmitTs < this.minIntervalMs) {
      return;
    }
    this.lastEmitTs = now;

    for (const listener of this.listeners) {
      listener(normalized);
    }
  }

  private normalizeFrame(frame: TelemetryFrame): TelemetryFrame {
    const sorted = [...frame.standings].sort((a, b) => a.position - b.position);
    const classCounters = new Map<VehicleClass, number>();
    const classBestLapMs: Partial<Record<VehicleClass, number>> = {};
    let overallBestLapMs: number | null = null;

    const enriched = sorted.map((entry, idx) => {
      const nextClassPos = (classCounters.get(entry.vehicleClass) ?? 0) + 1;
      classCounters.set(entry.vehicleClass, nextClassPos);

      if (entry.bestLapMs !== null && entry.bestLapMs > 0) {
        if (overallBestLapMs === null || entry.bestLapMs < overallBestLapMs) {
          overallBestLapMs = entry.bestLapMs;
        }
        const currentClassBest = classBestLapMs[entry.vehicleClass];
        if (currentClassBest === undefined || entry.bestLapMs < currentClassBest) {
          classBestLapMs[entry.vehicleClass] = entry.bestLapMs;
        }
      }

      return {
        ...entry,
        position: entry.position > 0 ? entry.position : idx + 1,
        classPosition: entry.classPosition > 0 ? entry.classPosition : nextClassPos,
      };
    });

    const localPlayer = enriched.find((s) => s.isPlayer);
    const resolvedFocusId =
      this.focusedDriverId && enriched.some((s) => s.id === this.focusedDriverId)
        ? this.focusedDriverId
        : localPlayer?.id ?? enriched[0]?.id ?? null;

    const focusedInputs =
      (resolvedFocusId && frame.carInputsById?.[resolvedFocusId]) || frame.playerInputs;
    const focusedTelemetry =
      (resolvedFocusId && frame.carTelemetryById?.[resolvedFocusId]) || frame.vehicleTelemetry;

    return {
      ...frame,
      standings: enriched,
      overallBestLapMs: frame.overallBestLapMs ?? overallBestLapMs,
      classBestLapMs: Object.keys(frame.classBestLapMs).length > 0 ? frame.classBestLapMs : classBestLapMs,
      focusedDriverId: resolvedFocusId,
      playerInputs: focusedInputs,
      vehicleTelemetry: focusedTelemetry,
    };
  }
}
