import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUdpBridgePacket } from '../src/providers/lmu-udp-receiver.ts';

test('parseUdpBridgePacket extracts 60Hz pedals, fuel, and 4-wheel tire data', () => {
  const payload = JSON.stringify({
    throttle: 0.92,
    brake: 0.0,
    clutch: 0.05,
    steering: -0.32,
    gear: 4,
    speedKmh: 218.4,
    rpm: 7420,
    maxRpm: 8500,
    fuelLiters: 52.34,
    fuelCapacity: 90,
    tires: [
      { wearPct: 86.4, tempSurfaceC: 84, tempCoreC: 81 },
      { wearPct: 88.1, tempSurfaceC: 82, tempCoreC: 80 },
      { wearPct: 89.0, tempSurfaceC: 85, tempCoreC: 82 },
      { wearPct: 90.2, tempSurfaceC: 83, tempCoreC: 81 },
    ],
  });

  const parsed = parseUdpBridgePacket(Buffer.from(payload, 'utf8'));
  assert.ok(parsed);
  assert.equal(parsed.playerInputs.throttle, 0.92);
  assert.equal(parsed.playerInputs.clutch, 0.05);
  assert.equal(parsed.playerInputs.steeringAngle, -0.32);
  assert.equal(parsed.playerInputs.gear, 4);
  assert.equal(parsed.playerInputs.speedKmh, 218);
  assert.equal(parsed.fuelLiters, 52.34);
  assert.equal(parsed.tires.fl.wearPct, 86.4);
  assert.equal(parsed.tires.fl.tempSurfaceC, 84);
  assert.equal(parsed.tires.rr.wearPct, 90.2);
});
