import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapLmuRestToFrame,
  mapSessionType,
  mapVehicleClass,
} from '../src/providers/lmu-rest-provider.ts';

test('mapVehicleClass normalizes LMU class strings', () => {
  assert.equal(mapVehicleClass('Hypercar'), 'HYPERCAR');
  assert.equal(mapVehicleClass('LMH'), 'HYPERCAR');
  assert.equal(mapVehicleClass('LMP2'), 'LMP2');
  assert.equal(mapVehicleClass('LMGT3'), 'LMGT3');
  assert.equal(mapVehicleClass('GTE'), 'GTE');
  assert.equal(mapVehicleClass('Other'), 'UNKNOWN');
});

test('mapSessionType normalizes LMU session names', () => {
  assert.equal(mapSessionType('RACE1'), 'RACE');
  assert.equal(mapSessionType('QUALIFY'), 'QUALIFYING');
  assert.equal(mapSessionType('PRACTICE1'), 'PRACTICE');
  assert.equal(mapSessionType('WARMUP'), 'WARMUP');
  assert.equal(mapSessionType(''), 'UNKNOWN');
});

test('mapLmuRestToFrame maps standings and session metadata', () => {
  const frame = mapLmuRestToFrame(
    [
      {
        slotID: 10,
        driverName: 'K. Estre',
        vehicleName: 'Porsche 963',
        carNumber: 6,
        carClass: 'Hypercar',
        position: 1,
        lapsCompleted: 12,
        lastLapTime: 204.321,
        bestLapTime: 203.111,
        player: true,
        pitting: false,
      },
      {
        slotID: 11,
        driverName: 'A. Farfus',
        vehicleName: 'BMW M4 GT3',
        carNumber: 31,
        carClass: 'LMGT3',
        position: 2,
        lapsCompleted: 11,
        lastLapTime: 235.5,
        bestLapTime: -1,
        timeBehindLeader: 31.2,
        timeBehindNext: 31.2,
        lapsBehindLeader: 1,
        lapDistance: 6813,
        pitting: true,
      },
    ],
    {
      trackName: 'Circuit de la Sarthe',
      session: 'RACE1',
      lapDistance: 13626,
      currentEventTime: 1000,
      endEventTime: 3600,
      trackTemp: 28.4,
      ambientTemp: 21.6,
      raining: 0,
    }
  );

  assert.equal(frame.status, 'connected');
  assert.equal(frame.session.trackName, 'Circuit de la Sarthe');
  assert.equal(frame.session.sessionType, 'RACE');
  assert.equal(frame.session.sessionTimeRemainingSec, 2600);
  assert.equal(frame.standings.length, 2);
  assert.equal(frame.standings[0].isPlayer, true);
  assert.equal(frame.standings[0].bestLapMs, 203_111);
  assert.equal(frame.standings[1].bestLapMs, null);
  assert.equal(frame.standings[1].pitStatus, 'PIT_LANE');
  assert.equal(frame.standings[1].lapDistancePct, 0.5);
  assert.equal(frame.vehicleTelemetry?.weather.trackTempC, 28);
  assert.equal(frame.vehicleTelemetry?.weather.airTempC, 22);
  assert.equal(frame.vehicleTelemetry?.weather.trackCondition, 'DRY');
});

test('mapLmuRestToFrame merges repairAndRefuel tire wear, fuel, virtual energy, and weather', () => {
  const frame = mapLmuRestToFrame(
    [
      {
        slotID: 1,
        driverName: 'Player One',
        vehicleName: 'Ferrari 499P',
        carNumber: 51,
        carClass: 'Hypercar',
        position: 1,
        lapsCompleted: 3,
        player: true,
        fuelFraction: 0,
        veFraction: 1,
      },
    ],
    {
      trackName: 'Spa-Francorchamps',
      session: 'PRACTICE1',
    },
    'lmu-rest',
    {
      repairAndRefuel: {
        currentWeather: {
          ambientTempKelvin: 293.17,
          trackTempKelvin: 310.48,
          humidity: 0.500978,
          raining: 0,
        },
        fuelInfo: {
          currentFuel: 0.75,
          maxFuel: 120,
          currentVirtualEnergy: 327500000,
          maxVirtualEnergy: 655000000,
        },
        wearables: {
          tires: [0.985, 0.962, 0.991, 0.974],
        },
      },
    }
  );

  assert.equal(frame.vehicleTelemetry?.tires.fl.wearPct, 98.5);
  assert.equal(frame.vehicleTelemetry?.tires.fr.wearPct, 96.2);
  assert.equal(frame.vehicleTelemetry?.tires.rl.wearPct, 99.1);
  assert.equal(frame.vehicleTelemetry?.tires.rr.wearPct, 97.4);
  assert.equal(frame.vehicleTelemetry?.fuel.levelLiters, 90);
  assert.equal(frame.vehicleTelemetry?.fuel.capacityLiters, 120);
  assert.equal(frame.vehicleTelemetry?.fuel.virtualEnergyPct, 50);
  assert.equal(frame.vehicleTelemetry?.weather.trackTempC, 37);
  assert.equal(frame.vehicleTelemetry?.weather.airTempC, 20);
  assert.equal(frame.vehicleTelemetry?.weather.humidityPct, 50);
});
