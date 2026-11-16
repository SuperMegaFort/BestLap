import { LMU_TRACKS, resolveTrack } from '../tracks/lmu-tracks.js';

function getClassDotColor(entry) {
  if (entry.isPlayer) return '#00c2ff'; // Distinct cyan for local player
  switch (entry.vehicleClass) {
    case 'HYPERCAR': return '#ef4444'; // Red for Hypercar
    case 'LMP2': return '#3b82f6'; // Blue for LMP2
    case 'LMGT3':
    case 'GTE': return '#22c55e'; // Green for GT3 / GTE
    default: return '#e2e8f0';
  }
}

function computeWorldProjection(points, viewW = 240, viewH = 200, pad = 18) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min((viewW - pad * 2) / spanX, (viewH - pad * 2) / spanZ);
  const offsetX = (viewW - spanX * scale) / 2;
  const offsetY = (viewH - spanZ * scale) / 2;

  return (x, z) => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + (z - minZ) * scale,
  });
}

export class TrackMapWidget {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.currentTrackKey = 'sarthe';
    this.pathLength = 0;
    this.worldProject = null;
    this.lastWorldTrackName = '';
    this.buildSkeleton();
  }

  buildSkeleton() {
    this.rootEl.classList.add('trackmap-widget');
    this.rootEl.innerHTML = `
      <div class="trackmap-header">
        <span data-ref="trackTitle">Track Map</span>
        <span data-ref="carCount">0 CARS</span>
      </div>
      <div class="trackmap-canvas-wrap">
        <svg class="trackmap-svg" viewBox="0 0 240 200">
          <path class="track-outline-bg" data-ref="trackBg" d="${LMU_TRACKS.sarthe.path}" />
          <path class="track-outline-fg" data-ref="trackFg" d="${LMU_TRACKS.sarthe.path}" />
          <g data-ref="carsLayer"></g>
        </svg>
      </div>
      <div class="trackmap-legend">
        <span class="legend-item"><span class="legend-dot" style="background:#00c2ff"></span>You</span>
        <span class="legend-item"><span class="legend-dot" style="background:#ef4444"></span>HY</span>
        <span class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>LMP2</span>
        <span class="legend-item"><span class="legend-dot" style="background:#22c55e"></span>GT3</span>
      </div>
    `;

    this.refs = {
      trackTitle: this.rootEl.querySelector('[data-ref="trackTitle"]'),
      carCount: this.rootEl.querySelector('[data-ref="carCount"]'),
      trackBg: this.rootEl.querySelector('[data-ref="trackBg"]'),
      trackFg: this.rootEl.querySelector('[data-ref="trackFg"]'),
      carsLayer: this.rootEl.querySelector('[data-ref="carsLayer"]'),
    };
    this.pathLength = this.refs.trackFg.getTotalLength();
  }

  setTrack(trackName, trackMapPoints) {
    if (Array.isArray(trackMapPoints) && trackMapPoints.length > 10) {
      if (this.lastWorldTrackName !== trackName || !this.worldProject) {
        this.lastWorldTrackName = trackName;
        this.worldProject = computeWorldProjection(trackMapPoints);
        const cmds = trackMapPoints.map((p, idx) => {
          const pt = this.worldProject(p.x, p.z);
          return `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        });
        const d = `${cmds.join(' ')} Z`;
        this.refs.trackBg.setAttribute('d', d);
        this.refs.trackFg.setAttribute('d', d);
        this.pathLength = this.refs.trackFg.getTotalLength();
      }
      return;
    }

    this.worldProject = null;
    const resolved = resolveTrack(trackName);
    if (resolved.key !== this.currentTrackKey) {
      this.currentTrackKey = resolved.key;
      this.refs.trackBg.setAttribute('d', resolved.path);
      this.refs.trackFg.setAttribute('d', resolved.path);
      this.pathLength = this.refs.trackFg.getTotalLength();
    }
  }

  render(frame) {
    const standings = frame.standings ?? [];
    const focusedId = frame.focusedDriverId ?? null;
    const trackName = frame.session?.trackName || 'Track Map';
    this.refs.trackTitle.textContent = trackName;
    this.refs.carCount.textContent = `${standings.length} CARS`;
    this.setTrack(trackName, frame.trackMapPoints);

    if (standings.length === 0 || this.pathLength <= 0) {
      this.refs.carsLayer.innerHTML = '';
      return;
    }

    const svgNs = 'http://www.w3.org/2000/svg';
    const fragment = document.createDocumentFragment();

    const ordered = [...standings].sort(
      (a, b) => Number(a.isPlayer || a.id === focusedId) - Number(b.isPlayer || b.id === focusedId)
    );

    for (const car of ordered) {
      let pt;
      if (this.worldProject && car.worldPos) {
        pt = this.worldProject(car.worldPos.x, car.worldPos.z);
      } else {
        const pct = ((car.lapDistancePct % 1) + 1) % 1;
        pt = this.refs.trackFg.getPointAtLength(pct * this.pathLength);
      }

      const color = getClassDotColor(car);
      const isFocused = focusedId === car.id && !car.isPlayer;

      const g = document.createElementNS(svgNs, 'g');
      g.setAttribute('transform', `translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);

      if (car.isPlayer) {
        const halo = document.createElementNS(svgNs, 'circle');
        halo.setAttribute('r', '10.5');
        halo.setAttribute('fill', 'rgba(0, 194, 255, 0.3)');
        g.appendChild(halo);
      } else if (isFocused) {
        const focusRing = document.createElementNS(svgNs, 'circle');
        focusRing.setAttribute('r', '10');
        focusRing.setAttribute('fill', 'none');
        focusRing.setAttribute('stroke', '#facc15');
        focusRing.setAttribute('stroke-width', '1.8');
        g.appendChild(focusRing);
      }

      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('r', car.isPlayer || isFocused ? '7.5' : '6');
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', '#0b0e14');
      circle.setAttribute('stroke-width', '1.2');
      g.appendChild(circle);

      const label = document.createElementNS(svgNs, 'text');
      label.setAttribute('class', 'car-dot-label');
      label.textContent = car.carNumber;
      g.appendChild(label);

      fragment.appendChild(g);
    }

    this.refs.carsLayer.innerHTML = '';
    this.refs.carsLayer.appendChild(fragment);
  }
}
