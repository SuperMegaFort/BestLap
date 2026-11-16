export class InputsWidget {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.buildSkeleton();
  }

  buildSkeleton() {
    this.rootEl.classList.add('inputs-widget');
    this.rootEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--text-secondary);letter-spacing:0.04em;text-transform:uppercase">
        <span data-ref="focusLabel">Telemetry</span>
        <span data-ref="focusClass" style="color:var(--accent-cyan)"></span>
      </div>
      <div class="inputs-main">
        <div class="inputs-gear-box">
          <div class="inputs-gear" data-ref="gear">N</div>
          <div class="inputs-speed" data-ref="speed">0 km/h</div>
        </div>
        <div class="inputs-pedals">
          <div class="pedal-col">
            <div class="pedal-track"><div class="pedal-fill clutch" data-ref="clutch"></div></div>
            <div class="pedal-label">C</div>
          </div>
          <div class="pedal-col">
            <div class="pedal-track"><div class="pedal-fill brake" data-ref="brake"></div></div>
            <div class="pedal-label">B</div>
          </div>
          <div class="pedal-col">
            <div class="pedal-track"><div class="pedal-fill throttle" data-ref="throttle"></div></div>
            <div class="pedal-label">T</div>
          </div>
        </div>
        <div class="inputs-wheel-box">
          <svg class="wheel-svg" viewBox="0 0 64 64" data-ref="wheel">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="5" />
            <line x1="8" y1="32" x2="56" y2="32" stroke="rgba(255,255,255,0.35)" stroke-width="4" stroke-linecap="round" />
            <line x1="32" y1="32" x2="32" y2="56" stroke="rgba(255,255,255,0.35)" stroke-width="4" stroke-linecap="round" />
            <rect x="29" y="3" width="6" height="8" rx="2" fill="#00c2ff" />
          </svg>
          <div class="wheel-angle-text" data-ref="angle">0°</div>
        </div>
      </div>
      <div class="rpm-bar-track">
        <div class="rpm-bar-fill" data-ref="rpmBar"></div>
      </div>
    `;

    this.refs = {
      focusLabel: this.rootEl.querySelector('[data-ref="focusLabel"]'),
      focusClass: this.rootEl.querySelector('[data-ref="focusClass"]'),
      gear: this.rootEl.querySelector('[data-ref="gear"]'),
      speed: this.rootEl.querySelector('[data-ref="speed"]'),
      clutch: this.rootEl.querySelector('[data-ref="clutch"]'),
      brake: this.rootEl.querySelector('[data-ref="brake"]'),
      throttle: this.rootEl.querySelector('[data-ref="throttle"]'),
      wheel: this.rootEl.querySelector('[data-ref="wheel"]'),
      angle: this.rootEl.querySelector('[data-ref="angle"]'),
      rpmBar: this.rootEl.querySelector('[data-ref="rpmBar"]'),
    };
  }

  render(frame) {
    const inputs = frame.playerInputs;
    if (!inputs) return;

    const focused = frame.standings?.find((s) => s.id === frame.focusedDriverId);
    if (focused) {
      this.refs.focusLabel.textContent = `#${focused.carNumber} ${focused.driverName}`;
      this.refs.focusClass.textContent = focused.isPlayer ? 'YOU' : focused.vehicleClass;
    }

    const gearText = inputs.gear === -1 ? 'R' : inputs.gear === 0 ? 'N' : String(inputs.gear);
    this.refs.gear.textContent = gearText;
    this.refs.speed.textContent = `${Math.round(inputs.speedKmh)} km/h`;

    this.refs.clutch.style.height = `${Math.round(inputs.clutch * 100)}%`;
    this.refs.brake.style.height = `${Math.round(inputs.brake * 100)}%`;
    this.refs.throttle.style.height = `${Math.round(inputs.throttle * 100)}%`;

    const deg = Math.round(inputs.steeringAngle * 180);
    this.refs.wheel.style.transform = `rotate(${deg}deg)`;
    this.refs.angle.textContent = `${deg}°`;

    const rpmPct = inputs.maxRpm > 0 ? Math.min(100, (inputs.rpm / inputs.maxRpm) * 100) : 0;
    this.refs.rpmBar.style.width = `${rpmPct.toFixed(1)}%`;
  }
}
