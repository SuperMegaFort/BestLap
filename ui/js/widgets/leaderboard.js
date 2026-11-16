function formatLapTime(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '--:--.---';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}

function formatInterval(ms, lapsDown, isClassLeader) {
  if (isClassLeader) return '-';
  if (lapsDown > 0) return `${lapsDown}L`;
  if (typeof ms !== 'number' || ms <= 0) return '-';
  return (ms / 1000).toFixed(1);
}

function formatClock(sec) {
  if (typeof sec !== 'number' || sec < 0) return '--:--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function tireLetter(compound) {
  switch (compound) {
    case 'SOFT': return 'S';
    case 'MEDIUM': return 'M';
    case 'HARD': return 'H';
    case 'WET':
    case 'INTER': return 'W';
    default: return 'U';
  }
}

function rankShort(rank) {
  switch (rank) {
    case 'PLATINUM': return 'PL';
    case 'GOLD': return 'GD';
    case 'SILVER': return 'SV';
    case 'BRONZE': return 'BZ';
    default: return null;
  }
}

export class LeaderboardWidget {
  constructor(rootEl, options = {}) {
    this.rootEl = rootEl;
    this.maxPerClass = options.maxPerClass ?? 60;
    this.onSelectDriver = options.onSelectDriver ?? null;
    this.buildSkeleton();
  }

  buildSkeleton() {
    this.rootEl.classList.add('leaderboard-widget');
    this.rootEl.innerHTML = `
      <div class="lb-top-bar">
        <div class="lb-top-left">
          <div class="lb-session-meta">
            <span class="lb-status-dot" data-ref="statusDot"></span>
            <span data-ref="sessionClock">R | --:--:--</span>
          </div>
          <span class="lb-car-total" data-ref="carTotal">0</span>
        </div>
        <div class="lb-top-right">
          <div></div>
          <div style="text-align:right">Int</div>
          <div style="text-align:right">Last</div>
        </div>
      </div>
      <div class="lb-body" data-ref="body">
        <div class="lb-empty">Waiting for telemetry stream...</div>
      </div>
    `;

    this.refs = {
      statusDot: this.rootEl.querySelector('[data-ref="statusDot"]'),
      sessionClock: this.rootEl.querySelector('[data-ref="sessionClock"]'),
      carTotal: this.rootEl.querySelector('[data-ref="carTotal"]'),
      body: this.rootEl.querySelector('[data-ref="body"]'),
    };

    // Use pointerdown delegation on persistent container so 20Hz re-renders never swallow clicks
    this.refs.body.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.lb-row[data-driver-id]');
      if (!row) return;
      this.onSelectDriver?.(row.dataset.driverId);
    });
  }

  setConnectionState(state) {
    this.refs.statusDot.classList.remove('connected', 'disconnected');
    if (state === 'connected') this.refs.statusDot.classList.add('connected');
    if (state === 'disconnected') this.refs.statusDot.classList.add('disconnected');
  }

  render(frame) {
    const { session, standings, overallBestLapMs, classBestLapMs, classSof, focusedDriverId, status } = frame;

    this.setConnectionState(status === 'connected' ? 'connected' : 'waiting');
    const sessChar = (session.sessionType || 'R')[0];
    const rem = formatClock(session.sessionTimeRemainingSec);
    const tot = session.sessionTotalTimeSec ? ` / ${Math.round(session.sessionTotalTimeSec / 60)}m` : '';
    this.refs.sessionClock.textContent = `${sessChar} | ${rem}${tot}`;
    this.refs.carTotal.textContent = `${standings.length}`;

    if (standings.length === 0) {
      this.refs.body.innerHTML = '<div class="lb-empty">Waiting for Le Mans Ultimate session...</div>';
      return;
    }

    const hasAnyRank = standings.some((s) => Boolean(s.driverRank));

    // Group standings by vehicleClass preserving class order
    const groups = new Map();
    for (const entry of standings) {
      if (!groups.has(entry.vehicleClass)) groups.set(entry.vehicleClass, []);
      groups.get(entry.vehicleClass).push(entry);
    }

    const fragment = document.createDocumentFragment();

    for (const [vehicleClass, entries] of groups.entries()) {
      const sof = classSof?.[vehicleClass] ?? 2500;

      // Class Section Header
      const header = document.createElement('div');
      header.className = 'lb-class-header';
      header.dataset.class = vehicleClass;

      const headerLeft = document.createElement('div');
      headerLeft.className = 'lb-class-left';

      const tagGroup = document.createElement('div');
      tagGroup.className = 'lb-class-tag-group';

      const classPill = document.createElement('span');
      classPill.className = 'lb-class-pill';
      classPill.textContent = vehicleClass;

      const sofText = document.createElement('span');
      sofText.className = 'lb-sof-text';
      sofText.textContent = `SoF ${sof}`;
      tagGroup.append(classPill, sofText);

      const countPill = document.createElement('span');
      countPill.className = 'lb-class-count';
      countPill.textContent = String(entries.length);

      headerLeft.append(tagGroup, countPill);

      const headerRight = document.createElement('div');
      headerRight.className = 'lb-class-right';

      header.append(headerLeft, headerRight);
      fragment.appendChild(header);

      // Class Rows
      const visibleEntries = entries.slice(0, this.maxPerClass);
      for (let i = 0; i < visibleEntries.length; i++) {
        const entry = visibleEntries[i];
        const isFocused = focusedDriverId === entry.id;

        const row = document.createElement('div');
        row.className = `lb-row${entry.isPlayer ? ' is-player' : ''}${isFocused ? ' is-focused' : ''}`;
        row.dataset.class = entry.vehicleClass;
        row.dataset.driverId = entry.id;
        row.title = `Click to follow ${entry.driverName}'s telemetry`;

        const left = document.createElement('div');
        left.className = `lb-row-left${hasAnyRank ? '' : ' no-rank'}`;

        const posBox = document.createElement('div');
        posBox.className = 'lb-pos-box';
        posBox.textContent = String(entry.classPosition || i + 1);

        const carBadge = document.createElement('div');
        carBadge.className = 'lb-car-badge';
        carBadge.textContent = `#${entry.carNumber}`;

        const driverName = document.createElement('div');
        driverName.className = 'lb-driver-name';
        driverName.textContent = entry.driverName;

        // Pit / Lap tag
        const pitWrap = document.createElement('div');
        if (entry.pitStatus === 'PIT_LANE' || entry.pitStatus === 'IN_GARAGE') {
          const pitGroup = document.createElement('span');
          pitGroup.className = 'lb-pit-group';
          const lapTag = document.createElement('span');
          lapTag.className = 'lb-lap-tag';
          lapTag.textContent = `L${entry.lapsCompleted}`;
          const pitTime = document.createElement('span');
          pitTime.className = 'lb-pit-time';
          pitTime.textContent = entry.pitTimeSec ? `${entry.pitTimeSec}s` : 'PIT';
          pitGroup.append(lapTag, pitTime);
          pitWrap.appendChild(pitGroup);
        }

        // Energy / Battery % Pill
        const energyWrap = document.createElement('div');
        if (typeof entry.energyPct === 'number') {
          const ePill = document.createElement('span');
          ePill.className = `lb-energy-pill${entry.energyPct <= 20 ? ' low' : ''}`;
          ePill.textContent = `${Math.round(entry.energyPct)}%`;
          energyWrap.appendChild(ePill);
        }

        // Tire Compound Badge (S / M / H / W)
        const letter = tireLetter(entry.tireCompound);
        const tireBadge = document.createElement('span');
        tireBadge.className = `lb-tire-badge tire-${letter}`;
        tireBadge.textContent = letter === 'U' ? '-' : letter;

        left.append(posBox, carBadge, driverName, pitWrap, energyWrap, tireBadge);

        if (hasAnyRank) {
          const short = rankShort(entry.driverRank);
          const rankPill = document.createElement('div');
          if (short) {
            rankPill.className = `lb-rank-pill rank-${entry.driverRank}`;
            rankPill.textContent = short;
          }
          left.appendChild(rankPill);
        }

        // Right Translucent Section (Pos Delta / Int / Last)
        const right = document.createElement('div');
        right.className = 'lb-row-right';

        const deltaEl = document.createElement('div');
        const delta = entry.positionDelta ?? 0;
        if (delta > 0) {
          deltaEl.className = 'lb-pos-delta up';
          deltaEl.textContent = `^ ${delta}`;
        } else if (delta < 0) {
          deltaEl.className = 'lb-pos-delta down';
          deltaEl.textContent = `v ${Math.abs(delta)}`;
        } else {
          deltaEl.className = 'lb-pos-delta flat';
          deltaEl.textContent = '—';
        }

        const intEl = document.createElement('div');
        intEl.className = 'lb-int';
        intEl.textContent = formatInterval(entry.intervalMs, entry.lapsDown, i === 0);

        const lastEl = document.createElement('div');
        lastEl.className = 'lb-last';
        lastEl.textContent = formatLapTime(entry.lastLapMs);
        if (entry.lastLapMs && overallBestLapMs && entry.lastLapMs <= overallBestLapMs) {
          lastEl.classList.add('overall-best');
        } else if (
          entry.lastLapMs &&
          classBestLapMs?.[entry.vehicleClass] &&
          entry.lastLapMs <= classBestLapMs[entry.vehicleClass]
        ) {
          lastEl.classList.add('class-best');
        }

        right.append(deltaEl, intEl, lastEl);
        row.append(left, right);
        fragment.appendChild(row);
      }
    }

    this.refs.body.innerHTML = '';
    this.refs.body.appendChild(fragment);
  }
}
