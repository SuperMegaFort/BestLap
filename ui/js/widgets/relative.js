function wrapTrackDeltaPct(targetPct, playerPct) {
  let diff = targetPct - playerPct;
  while (diff >= 0.5) diff -= 1;
  while (diff < -0.5) diff += 1;
  return diff;
}

export class RelativeWidget {
  constructor(rootEl, options = {}) {
    this.rootEl = rootEl;
    this.rowsEachSide = options.rowsEachSide ?? 3;
    this.onSelectDriver = options.onSelectDriver ?? null;
    this.buildSkeleton();
  }

  buildSkeleton() {
    this.rootEl.classList.add('relative-widget');
    this.rootEl.innerHTML = `
      <div class="rel-header">
        <span>Relative</span>
        <span data-ref="meta">ON TRACK</span>
      </div>
      <div class="rel-body" data-ref="body">
        <div class="lb-empty">Waiting for player telemetry...</div>
      </div>
    `;
    this.refs = {
      meta: this.rootEl.querySelector('[data-ref="meta"]'),
      body: this.rootEl.querySelector('[data-ref="body"]'),
    };

    this.refs.body.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.rel-row[data-driver-id]');
      if (!row) return;
      this.onSelectDriver?.(row.dataset.driverId);
    });
  }

  render(frame) {
    const standings = frame.standings ?? [];
    if (standings.length === 0) {
      this.refs.body.innerHTML = '<div class="lb-empty">Waiting for session...</div>';
      return;
    }

    const player = standings.find((s) => s.isPlayer) ?? standings[0];
    const refLapMs = player.bestLapMs || player.lastLapMs || 210_000;

    const computed = standings.map((car) => {
      const deltaPct = car.id === player.id ? 0 : wrapTrackDeltaPct(car.lapDistancePct, player.lapDistancePct);
      const deltaSec = (deltaPct * refLapMs) / 1000;
      const lapDiff = car.lapsCompleted - player.lapsCompleted;
      return { car, deltaPct, deltaSec, lapDiff };
    });

    const ahead = computed
      .filter((item) => item.car.id !== player.id && item.deltaPct > 0)
      .sort((a, b) => b.deltaPct - a.deltaPct)
      .slice(-this.rowsEachSide);

    const behind = computed
      .filter((item) => item.car.id !== player.id && item.deltaPct <= 0)
      .sort((a, b) => b.deltaPct - a.deltaPct)
      .slice(0, this.rowsEachSide);

    const playerItem = computed.find((item) => item.car.id === player.id);
    const ordered = [...ahead, ...(playerItem ? [playerItem] : []), ...behind];

    this.refs.meta.textContent = `P${player.position} · ${player.vehicleClass}`;

    const fragment = document.createDocumentFragment();
    for (const { car, deltaSec, lapDiff } of ordered) {
      const row = document.createElement('div');
      let lapClass = '';
      if (car.id !== player.id) {
        if (lapDiff > 0) lapClass = ' is-ahead-lap';
        else if (lapDiff < 0) lapClass = ' is-behind-lap';
      }
      row.className = `rel-row${car.id === player.id ? ' is-player' : ''}${frame.focusedDriverId === car.id ? ' is-focused' : ''}${lapClass}`;
      row.dataset.class = car.vehicleClass;
      row.dataset.driverId = car.id;
      row.style.cursor = 'pointer';

      const posEl = document.createElement('div');
      posEl.className = 'rel-pos';
      posEl.textContent = `P${car.position}`;

      const numWrap = document.createElement('div');
      numWrap.style.textAlign = 'center';
      const numEl = document.createElement('span');
      numEl.className = 'rel-num';
      numEl.textContent = `#${car.carNumber}`;
      numWrap.appendChild(numEl);

      const driverEl = document.createElement('div');
      driverEl.className = 'rel-driver';
      driverEl.textContent = car.driverName;

      const statusEl = document.createElement('div');
      statusEl.style.textAlign = 'center';
      if (car.pitStatus === 'PIT_LANE' || car.pitStatus === 'IN_GARAGE') {
        const tag = document.createElement('span');
        tag.className = 'lb-pit-tag';
        tag.textContent = car.pitStatus === 'IN_GARAGE' ? 'GAR' : 'PIT';
        statusEl.appendChild(tag);
      }

      const deltaEl = document.createElement('div');
      deltaEl.className = 'rel-delta';
      if (car.id === player.id) {
        deltaEl.textContent = '0.0s';
      } else if (deltaSec > 0) {
        deltaEl.classList.add('ahead');
        deltaEl.textContent = `+${deltaSec.toFixed(1)}s`;
      } else {
        deltaEl.classList.add('behind');
        deltaEl.textContent = `${deltaSec.toFixed(1)}s`;
      }

      row.append(posEl, numWrap, driverEl, statusEl, deltaEl);
      fragment.appendChild(row);
    }

    this.refs.body.innerHTML = '';
    this.refs.body.appendChild(fragment);
  }
}
