function wearColor(pct) {
  if (pct >= 70) return 'var(--accent-green)';
  if (pct >= 45) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

export class StrategyWidget {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.buildSkeleton();
  }

  buildSkeleton() {
    this.rootEl.classList.add('strategy-widget');
    const makeTire = (key, label) => `
      <div class="tire-card">
        <div class="tire-top">
          <span class="tire-label">${label}</span>
          <span class="tire-wear-val" data-ref="${key}Wear">--%</span>
        </div>
        <div class="tire-wear-bar"><div class="tire-wear-fill" data-ref="${key}Bar"></div></div>
        <div class="tire-temps" data-ref="${key}Temp">--° / --°C</div>
      </div>
    `;

    this.rootEl.innerHTML = `
      <div>
        <div class="strat-section-title">
          <span data-ref="tiresTitle">Tires (Wear &amp; Temp)</span>
          <span class="compound-badge" data-ref="compound">--</span>
        </div>
        <div class="tires-grid">
          ${makeTire('fl', 'FL')}
          ${makeTire('fr', 'FR')}
          ${makeTire('rl', 'RL')}
          ${makeTire('rr', 'RR')}
        </div>
      </div>

      <div>
        <div class="strat-section-title">
          <span>Fuel &amp; Energy</span>
          <span data-ref="veMeta">VE --%</span>
        </div>
        <div class="fuel-grid">
          <div class="metric-box">
            <div class="metric-label">Fuel</div>
            <div class="metric-val" data-ref="fuelLevel">-- L</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Per Lap</div>
            <div class="metric-val" data-ref="fuelPerLap">--</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Est. Laps</div>
            <div class="metric-val" data-ref="fuelLaps">--</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Target Δ</div>
            <div class="metric-val" data-ref="fuelDelta">--</div>
          </div>
        </div>
      </div>

      <div class="weather-bar">
        <span data-ref="trackTemp">TRK --°C</span>
        <span data-ref="airTemp">AIR --°C</span>
        <span data-ref="humidity">HUM --%</span>
        <span class="track-state-pill" data-ref="trackState">DRY · 98%</span>
      </div>
    `;

    this.refs = {
      tiresTitle: this.rootEl.querySelector('[data-ref="tiresTitle"]'),
      compound: this.rootEl.querySelector('[data-ref="compound"]'),
      veMeta: this.rootEl.querySelector('[data-ref="veMeta"]'),
      fuelLevel: this.rootEl.querySelector('[data-ref="fuelLevel"]'),
      fuelPerLap: this.rootEl.querySelector('[data-ref="fuelPerLap"]'),
      fuelLaps: this.rootEl.querySelector('[data-ref="fuelLaps"]'),
      fuelDelta: this.rootEl.querySelector('[data-ref="fuelDelta"]'),
      trackTemp: this.rootEl.querySelector('[data-ref="trackTemp"]'),
      airTemp: this.rootEl.querySelector('[data-ref="airTemp"]'),
      humidity: this.rootEl.querySelector('[data-ref="humidity"]'),
      trackState: this.rootEl.querySelector('[data-ref="trackState"]'),
      tires: {
        fl: this.tireRefs('fl'),
        fr: this.tireRefs('fr'),
        rl: this.tireRefs('rl'),
        rr: this.tireRefs('rr'),
      },
    };
  }

  tireRefs(key) {
    return {
      wear: this.rootEl.querySelector(`[data-ref="${key}Wear"]`),
      bar: this.rootEl.querySelector(`[data-ref="${key}Bar"]`),
      temp: this.rootEl.querySelector(`[data-ref="${key}Temp"]`),
    };
  }

  render(frame) {
    const vt = frame.vehicleTelemetry;
    if (!vt) return;

    const focused = frame.standings?.find((s) => s.id === frame.focusedDriverId);
    if (this.refs.tiresTitle) {
      this.refs.tiresTitle.textContent = focused
        ? `Tires · #${focused.carNumber} ${focused.driverName}`
        : 'Tires (Wear & Temp)';
    }

    this.refs.compound.textContent = vt.tires.fl.compound;

    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      const t = vt.tires[key];
      const r = this.refs.tires[key];
      if (typeof t.wearPct === 'number') {
        r.wear.textContent = `${t.wearPct.toFixed(0)}%`;
        r.bar.style.width = `${Math.max(0, Math.min(100, t.wearPct))}%`;
        r.bar.style.background = wearColor(t.wearPct);
      } else {
        r.wear.textContent = '--%';
        r.bar.style.width = '0%';
      }
      r.temp.textContent =
        typeof t.tempSurfaceC === 'number'
          ? `${t.tempSurfaceC}° / ${t.tempCoreC ?? t.tempSurfaceC}°C`
          : '--° / --°C';
    }

    const { fuel, weather } = vt;
    this.refs.veMeta.textContent =
      fuel.virtualEnergyPct !== null ? `VE ${fuel.virtualEnergyPct.toFixed(1)}%` : 'FUEL ONLY';
    this.refs.fuelLevel.textContent = fuel.levelLiters > 0 ? `${fuel.levelLiters.toFixed(1)}L` : '-- L';
    this.refs.fuelPerLap.textContent = fuel.perLapLiters > 0 ? `${fuel.perLapLiters.toFixed(2)}L` : '--';
    this.refs.fuelLaps.textContent = fuel.lapsRemaining !== null ? `${fuel.lapsRemaining.toFixed(1)}` : '--';

    this.refs.fuelDelta.classList.remove('positive', 'negative');
    if (fuel.targetDeltaLiters !== null) {
      const sign = fuel.targetDeltaLiters >= 0 ? '+' : '';
      this.refs.fuelDelta.textContent = `${sign}${fuel.targetDeltaLiters.toFixed(1)}L`;
      this.refs.fuelDelta.classList.add(fuel.targetDeltaLiters >= 0 ? 'positive' : 'negative');
    } else {
      this.refs.fuelDelta.textContent = '--';
    }

    this.refs.trackTemp.textContent = `TRK ${weather.trackTempC}°C`;
    this.refs.airTemp.textContent = `AIR ${weather.airTempC}°C`;
    this.refs.humidity.textContent = `HUM ${weather.humidityPct}%`;
    this.refs.trackState.textContent = `${weather.trackCondition} · ${weather.gripPct}%`;
  }
}
