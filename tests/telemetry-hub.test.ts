import assert from 'node:assert/strict';
import test from 'node:test';
import { TelemetryHub } from '../src/core/telemetry-hub.ts';
import type { TelemetryFrame } from '../src/core/types.ts';

test('TelemetryHub computes class positions and best lap records', () => {
  const hub = new TelemetryHub(60);
  const received: TelemetryFrame[] = [];
  hub.subscribe((frame) => received.push(frame));

  hub.publish({
    timestamp: 1000,
    provider: 'test',
    status: 'connected',
    session: {
      sim: 'lmu',
      trackName: 'Spa-Francorchamps',
      sessionType: 'RACE',
      sessionTimeRemainingSec: 1200,
      sessionTotalTimeSec: 3600,
      currentLap: 5,
      totalLaps: null,
      trackTempC: 24,
      ambientTempC: 19,
      flagState: 'GREEN',
    },
    standings: [
      {
        id: '1',
        position: 2,
        classPosition: 0,
        carNumber: '8',
        driverName: 'S. Buemi',
        teamName: 'Toyota',
        carName: 'GR010',
        vehicleClass: 'HYPERCAR',
        isPlayer: false,
        lapsCompleted: 5,
        lastLapMs: 125_400,
        bestLapMs: 124_800,
        sector1Ms: null,
        sector2Ms: null,
        sector3Ms: null,
        gapToLeaderMs: 1200,
        intervalMs: 1200,
        lapsDown: 0,
        pitStatus: 'ON_TRACK',
        pitStops: 0,
        lapDistancePct: 0.4,
      },
      {
        id: '2',
        position: 1,
        classPosition: 0,
        carNumber: '50',
        driverName: 'A. Fuoco',
        teamName: 'Ferrari',
        carName: '499P',
        vehicleClass: 'HYPERCAR',
        isPlayer: true,
        lapsCompleted: 5,
        lastLapMs: 124_500,
        bestLapMs: 124_100,
        sector1Ms: null,
        sector2Ms: null,
        sector3Ms: null,
        gapToLeaderMs: 0,
        intervalMs: 0,
        lapsDown: 0,
        pitStatus: 'ON_TRACK',
        pitStops: 0,
        lapDistancePct: 0.42,
      },
      {
        id: '3',
        position: 3,
        classPosition: 0,
        carNumber: '92',
        driverName: 'K. Bachler',
        teamName: 'Manthey',
        carName: '911 GT3 R',
        vehicleClass: 'LMGT3',
        isPlayer: false,
        lapsCompleted: 4,
        lastLapMs: 138_200,
        bestLapMs: 137_900,
        sector1Ms: null,
        sector2Ms: null,
        sector3Ms: null,
        gapToLeaderMs: 15_000,
        intervalMs: 13_800,
        lapsDown: 1,
        pitStatus: 'ON_TRACK',
        pitStops: 0,
        lapDistancePct: 0.9,
      },
    ],
    overallBestLapMs: null,
    classBestLapMs: {},
  });

  assert.equal(received.length, 1);
  const frame = received[0];
  assert.equal(frame.standings[0].carNumber, '50');
  assert.equal(frame.standings[0].classPosition, 1);
  assert.equal(frame.standings[1].classPosition, 2);
  assert.equal(frame.standings[2].classPosition, 1);
  assert.equal(frame.overallBestLapMs, 124_100);
  assert.equal(frame.classBestLapMs.HYPERCAR, 124_100);
  assert.equal(frame.classBestLapMs.LMGT3, 137_900);
  assert.equal(frame.focusedDriverId, '2'); // defaults to isPlayer
});

test('TelemetryHub switches focused driver and resolves carInputsById', () => {
  const hub = new TelemetryHub(60);
  const received: TelemetryFrame[] = [];
  hub.subscribe((f) => received.push(f));

  hub.publish({
    timestamp: 2000,
    provider: 'test',
    status: 'connected',
    session: {
      sim: 'mock',
      trackName: 'Le Mans',
      sessionType: 'RACE',
      sessionTimeRemainingSec: 1000,
      sessionTotalTimeSec: 3600,
      currentLap: 2,
      totalLaps: null,
      trackTempC: 25,
      ambientTempC: 20,
      flagState: 'GREEN',
    },
    standings: [
      {
        id: '10',
        position: 1,
        classPosition: 1,
        positionDelta: 0,
        carNumber: '50',
        driverName: 'A. Fuoco',
        teamName: 'Ferrari',
        carName: '499P',
        vehicleClass: 'HYPERCAR',
        isPlayer: false,
        lapsCompleted: 2,
        lastLapMs: 204_000,
        bestLapMs: 204_000,
        sector1Ms: null,
        sector2Ms: null,
        sector3Ms: null,
        gapToLeaderMs: 0,
        intervalMs: 0,
        lapsDown: 0,
        pitStatus: 'ON_TRACK',
        pitStops: 0,
        pitTimeSec: null,
        lapDistancePct: 0.2,
        tireCompound: 'SOFT',
        rating: '3.1k',
      },
      {
        id: '20',
        position: 2,
        classPosition: 2,
        positionDelta: 0,
        carNumber: '6',
        driverName: 'K. Estre',
        teamName: 'Porsche',
        carName: '963',
        vehicleClass: 'HYPERCAR',
        isPlayer: true,
        lapsCompleted: 2,
        lastLapMs: 205_000,
        bestLapMs: 205_000,
        sector1Ms: null,
        sector2Ms: null,
        sector3Ms: null,
        gapToLeaderMs: 1000,
        intervalMs: 1000,
        lapsDown: 0,
        pitStatus: 'ON_TRACK',
        pitStops: 0,
        pitTimeSec: null,
        lapDistancePct: 0.19,
        tireCompound: 'MEDIUM',
        rating: '2.8k',
      },
    ],
    overallBestLapMs: null,
    classBestLapMs: {},
    carInputsById: {
      '10': { throttle: 0.2, brake: 0.8, clutch: 0, steeringAngle: 0.3, gear: 3, speedKmh: 120, rpm: 6000, maxRpm: 8500 },
      '20': { throttle: 1.0, brake: 0.0, clutch: 0, steeringAngle: 0.0, gear: 6, speedKmh: 310, rpm: 8100, maxRpm: 8500 },
    },
    carTelemetryById: {
      '10': {
        tires: {
          fl: { wearPct: 68, tempSurfaceC: 90, tempCoreC: 86, compound: 'SOFT' },
          fr: { wearPct: 70, tempSurfaceC: 88, tempCoreC: 85, compound: 'SOFT' },
          rl: { wearPct: 72, tempSurfaceC: 89, tempCoreC: 85, compound: 'SOFT' },
          rr: { wearPct: 74, tempSurfaceC: 87, tempCoreC: 84, compound: 'SOFT' },
        },
        fuel: { levelLiters: 32, capacityLiters: 90, perLapLiters: 4.5, lapsRemaining: 7.1, targetDeltaLiters: 2.0, virtualEnergyPct: 48 },
        weather: { trackTempC: 27, airTempC: 21, humidityPct: 54, trackCondition: 'DRY', gripPct: 98 },
      },
      '20': {
        tires: {
          fl: { wearPct: 88, tempSurfaceC: 82, tempCoreC: 80, compound: 'MEDIUM' },
          fr: { wearPct: 89, tempSurfaceC: 81, tempCoreC: 79, compound: 'MEDIUM' },
          rl: { wearPct: 90, tempSurfaceC: 83, tempCoreC: 80, compound: 'MEDIUM' },
          rr: { wearPct: 91, tempSurfaceC: 82, tempCoreC: 79, compound: 'MEDIUM' },
        },
        fuel: { levelLiters: 55, capacityLiters: 90, perLapLiters: 4.6, lapsRemaining: 11.9, targetDeltaLiters: 10.0, virtualEnergyPct: 76 },
        weather: { trackTempC: 27, airTempC: 21, humidityPct: 54, trackCondition: 'DRY', gripPct: 98 },
      },
    },
  });

  assert.equal(received[0].focusedDriverId, '20');
  assert.equal(received[0].playerInputs?.throttle, 1.0);
  assert.equal(received[0].vehicleTelemetry?.tires.fl.wearPct, 88);

  hub.setFocusedDriver('10');
  assert.equal(received[1].focusedDriverId, '10');
  assert.equal(received[1].playerInputs?.brake, 0.8);
  assert.equal(received[1].vehicleTelemetry?.tires.fl.wearPct, 68);
  assert.equal(received[1].vehicleTelemetry?.fuel.virtualEnergyPct, 48);
});
