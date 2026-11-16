import type { ConnectionStatus, TelemetryFrame } from '../core/types.ts';

export interface TelemetryProviderCallbacks {
  onFrame: (frame: TelemetryFrame) => void;
  onStatus?: (status: ConnectionStatus, message?: string) => void;
}

export interface TelemetryProvider {
  readonly name: string;
  start(callbacks: TelemetryProviderCallbacks): Promise<void>;
  stop(): Promise<void>;
}
