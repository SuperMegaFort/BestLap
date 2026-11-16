import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { PROJECT_ROOT } from '../src/core/config.ts';
import { OverlayServer } from '../src/core/ws-server.ts';

test('OverlayServer serves health, static UI, and broadcasts WebSocket JSON', async () => {
  const server = new OverlayServer({
    host: '127.0.0.1',
    port: 0,
    uiDir: path.join(PROJECT_ROOT, 'ui'),
    getInitialPayload: () => ({ hello: 'initial' }),
  });

  const { host, port } = await server.start();

  try {
    const healthRes = await fetch(`http://${host}:${port}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean };
    assert.equal(healthJson.ok, true);

    const uiRes = await fetch(`http://${host}:${port}/widgets/leaderboard.html`);
    assert.equal(uiRes.status, 200);
    const html = await uiRes.text();
    assert.ok(html.includes('BestLap'));

    // Connect raw TCP socket and perform RFC 6455 WebSocket handshake
    const receivedText = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.write(
          [
            'GET /ws HTTP/1.1',
            `Host: ${host}:${port}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version: 13',
            '\r\n',
          ].join('\r\n')
        );
      });

      let handshakeDone = false;
      socket.on('data', (chunk: Buffer) => {
        if (!handshakeDone) {
          const str = chunk.toString('utf8');
          const headerEnd = str.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            handshakeDone = true;
            assert.ok(str.includes('101 Switching Protocols'));
            const trailing = chunk.subarray(headerEnd + 4);
            if (trailing.length > 2) {
              const len = trailing[1] & 0x7f;
              const payload = trailing.subarray(2, 2 + len).toString('utf8');
              socket.destroy();
              resolve(payload);
            }
          }
          return;
        }
        if (chunk.length > 2) {
          const len = chunk[1] & 0x7f;
          const payload = chunk.subarray(2, 2 + len).toString('utf8');
          socket.destroy();
          resolve(payload);
        }
      });

      socket.on('error', reject);
    });

    assert.deepEqual(JSON.parse(receivedText), { hello: 'initial' });
  } finally {
    await server.stop();
  }
});
