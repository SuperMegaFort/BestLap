/**
 * Auto-reconnecting WebSocket client for BestLap telemetry frames.
 */
export class TelemetryClient {
  constructor(url = null) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url ?? `${protocol}//${window.location.host}/ws`;
    this.ws = null;
    this.reconnectDelayMs = 1000;
    this.frameListeners = new Set();
    this.statusListeners = new Set();
  }

  onFrame(cb) {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  onStatus(cb) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.emitStatus('connecting');
    this.ws = new WebSocket(this.url);

    this.ws.addEventListener('open', () => {
      this.emitStatus('connected');
    });

    this.ws.addEventListener('message', (event) => {
      try {
        const frame = JSON.parse(event.data);
        for (const listener of this.frameListeners) {
          listener(frame);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.addEventListener('close', () => {
      this.emitStatus('disconnected');
      setTimeout(() => this.connect(), this.reconnectDelayMs);
    });

    this.ws.addEventListener('error', () => {
      this.ws?.close();
    });
  }

  emitStatus(status) {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return;
    }
    if (payload?.type === 'set-focus') {
      fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: payload.driverId ?? null }),
      }).catch(() => {});
    }
  }
}
