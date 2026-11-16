import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';

const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function encodeWsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;

  if (len < 126) {
    const header = Buffer.allocUnsafe(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
    return Buffer.concat([header, payload]);
  }

  if (len < 65536) {
    const header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.allocUnsafe(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(len), 2);
  return Buffer.concat([header, payload]);
}

function encodePongFrame(payload: Buffer): Buffer {
  const len = Math.min(payload.length, 125);
  const header = Buffer.allocUnsafe(2);
  header[0] = 0x8a; // FIN + pong opcode
  header[1] = len;
  return Buffer.concat([header, payload.subarray(0, len)]);
}

function decodeWsTextFrame(chunk: Buffer): string | null {
  if (chunk.length < 2) return null;
  const opcode = chunk[0] & 0x0f;
  if (opcode !== 0x01) return null;

  const masked = (chunk[1] & 0x80) !== 0;
  let payloadLen = chunk[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (chunk.length < 4) return null;
    payloadLen = chunk.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    return null; // Control commands are small
  }

  if (masked) {
    if (chunk.length < offset + 4 + payloadLen) return null;
    const mask = chunk.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.allocUnsafe(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = chunk[offset + i] ^ mask[i % 4];
    }
    return payload.toString('utf8');
  }

  if (chunk.length < offset + payloadLen) return null;
  return chunk.subarray(offset, offset + payloadLen).toString('utf8');
}

export interface OverlayServerOptions {
  host: string;
  port: number;
  uiDir: string;
  getInitialPayload?: () => unknown;
  onClientMessage?: (msg: unknown) => void;
}

/**
 * Lightweight zero-dependency HTTP + RFC 6455 WebSocket server
 * serving the overlay UI and streaming telemetry frames.
 */
export class OverlayServer {
  private readonly host: string;
  private readonly port: number;
  private readonly uiDir: string;
  private readonly getInitialPayload?: () => unknown;
  private readonly onClientMessage?: (msg: unknown) => void;
  private readonly clients = new Set<Duplex>();
  private server: http.Server | null = null;

  constructor(options: OverlayServerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.uiDir = path.resolve(options.uiDir);
    this.getInitialPayload = options.getInitialPayload;
    this.onClientMessage = options.onClientMessage;
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) {
      return { host: this.host, port: this.port };
    }

    this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.server.on('upgrade', (req, socket) => this.handleUpgrade(req, socket));

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, this.host, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });

    const address = this.server.address();
    const actualPort = typeof address === 'object' && address ? address.port : this.port;
    return { host: this.host, port: actualPort };
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = null;
  }

  broadcastJson(data: unknown): void {
    if (this.clients.size === 0) return;
    const frame = encodeWsTextFrame(JSON.stringify(data));
    for (const client of this.clients) {
      if (client.writable && !client.destroyed) {
        client.write(frame);
      } else {
        this.clients.delete(client);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (reqUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, clients: this.clients.size }));
      return;
    }

    if (reqUrl.pathname === '/api/focus' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          this.onClientMessage?.({ type: 'set-focus', driverId: parsed.driverId ?? null });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, driverId: parsed.driverId ?? null }));
        } catch {
          res.writeHead(400);
          res.end('Bad Request');
        }
      });
      return;
    }

    const relativePath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');
    const resolvedPath = path.resolve(this.uiDir, relativePath);

    if (!resolvedPath.startsWith(this.uiDir + path.sep) && resolvedPath !== this.uiDir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(resolvedPath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(resolvedPath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    });
  }

  private handleUpgrade(req: http.IncomingMessage, socket: Duplex): void {
    const key = req.headers['sec-websocket-key'];
    const upgrade = req.headers.upgrade?.toLowerCase();

    if (typeof key !== 'string' || upgrade !== 'websocket') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_MAGIC_GUID)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n');

    socket.write(headers);
    this.clients.add(socket);

    if (this.getInitialPayload) {
      const initial = this.getInitialPayload();
      if (initial) {
        socket.write(encodeWsTextFrame(JSON.stringify(initial)));
      }
    }

    socket.on('data', (chunk: Buffer) => {
      if (chunk.length < 2) return;
      const opcode = chunk[0] & 0x0f;
      if (opcode === 0x08) {
        // Close frame
        this.clients.delete(socket);
        socket.end();
      } else if (opcode === 0x09) {
        // Ping frame -> reply with Pong
        socket.write(encodePongFrame(Buffer.alloc(0)));
      } else if (opcode === 0x01 && this.onClientMessage) {
        const text = decodeWsTextFrame(chunk);
        if (text) {
          try {
            this.onClientMessage(JSON.parse(text));
          } catch {
            // Ignore malformed client JSON
          }
        }
      }
    });

    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }
}
