import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRfactor2VehicleTelemetry } from '../src/providers/lmu-shm-provider.ts';

test('parseRfactor2VehicleTelemetry extracts inputs, fuel, and 4-wheel tire data', () => {
  const buf = Buffer.alloc(2048);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const base = 16;

  view.setFloat64(base + 200, 70, true); // mLocalVel.z = 70 m/s = 252 km/h
  view.setInt32(base + 352, 5, true); // mGear = 5
  view.setFloat64(base + 356, 7100, true); // mEngineRPM
  view.setFloat64(base + 388, 0.85, true); // mUnfilteredThrottle
  view.setFloat64(base + 396, 0.0, true); // mUnfilteredBrake
  view.setFloat64(base + 404, -0.25, true); // mUnfilteredSteering
  view.setFloat64(base + 412, 0.1, true); // mUnfilteredClutch
  view.setFloat64(base + 524, 44.5, true); // mFuel (L)
  view.setFloat64(base + 532, 8500, true); // mEngineMaxRPM
  view.setFloat64(base + 608, 90, true); // mFuelCapacity

  // FL wheel (index 0) at base + 848
  view.setFloat64(base + 848 + 136, 358.15, true); // mTemperature[1] = 85°C
  view.setFloat64(base + 848 + 152, 0.88, true); // mWear = 88%
  view.setFloat64(base + 848 + 204, 355.15, true); // mTireCarcassTemperature = 82°C

  const parsed = parseRfactor2VehicleTelemetry(view, base);
  assert.ok(parsed);
  assert.equal(parsed.playerInputs.gear, 5);
  assert.equal(parsed.playerInputs.speedKmh, 252);
  assert.equal(parsed.playerInputs.rpm, 7100);
  assert.equal(parsed.playerInputs.throttle, 0.85);
  assert.equal(parsed.playerInputs.clutch, 0.1);
  assert.equal(parsed.playerInputs.steeringAngle, -0.25);
  assert.equal(parsed.vehicleTelemetry.fuel.levelLiters, 44.5);
  assert.equal(parsed.vehicleTelemetry.tires.fl.wearPct, 88);
  assert.equal(parsed.vehicleTelemetry.tires.fl.tempSurfaceC, 85);
});
