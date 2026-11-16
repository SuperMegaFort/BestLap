export class InputGraphWidget {
  constructor(rootEl, options = {}) {
    this.rootEl = rootEl;
    this.maxSamples = options.maxSamples ?? 240; // 4.0s at 60 FPS
    this.history = [];
    this.target = { throttle: 0, brake: 0, clutch: 0 };
    this.current = { throttle: 0, brake: 0, clutch: 0 };
    this.rafId = null;

    this.buildSkeleton();
    this.setupCanvas();
    this.startLoop();
  }

  buildSkeleton() {
    this.rootEl.classList.add('input-graph-widget');
    this.rootEl.innerHTML = `
      <div class="ig-header">
        <span data-ref="title">Input Trace (4s · 60 FPS)</span>
        <div class="ig-legend">
          <span style="color:#22c55e" data-ref="tVal">T 0%</span>
          <span style="color:#ef4444" data-ref="bVal">B 0%</span>
          <span style="color:#38bdf8" data-ref="cVal">C 0%</span>
        </div>
      </div>
      <div class="ig-canvas-wrap" data-ref="wrap">
        <canvas class="ig-canvas" data-ref="canvas"></canvas>
      </div>
    `;

    this.refs = {
      title: this.rootEl.querySelector('[data-ref="title"]'),
      tVal: this.rootEl.querySelector('[data-ref="tVal"]'),
      bVal: this.rootEl.querySelector('[data-ref="bVal"]'),
      cVal: this.rootEl.querySelector('[data-ref="cVal"]'),
      wrap: this.rootEl.querySelector('[data-ref="wrap"]'),
      canvas: this.rootEl.querySelector('[data-ref="canvas"]'),
    };
  }

  setupCanvas() {
    this.ctx = this.refs.canvas.getContext('2d');
    const resize = () => {
      const rect = this.refs.wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.width = Math.max(1, Math.floor(rect.width));
      this.height = Math.max(1, Math.floor(rect.height));
      this.refs.canvas.width = Math.floor(this.width * dpr);
      this.refs.canvas.height = Math.floor(this.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(this.refs.wrap);
  }

  render(frame) {
    const inputs = frame.playerInputs;
    if (!inputs) return;
    const focused = frame.standings?.find((s) => s.id === frame.focusedDriverId);
    if (this.refs.title) {
      this.refs.title.textContent = focused
        ? `Inputs · #${focused.carNumber} ${focused.driverName}`
        : 'Input Trace (60 FPS)';
    }
    this.target.throttle = inputs.throttle;
    this.target.brake = inputs.brake;
    this.target.clutch = inputs.clutch;

    this.refs.tVal.textContent = `T ${Math.round(inputs.throttle * 100)}%`;
    this.refs.bVal.textContent = `B ${Math.round(inputs.brake * 100)}%`;
    this.refs.cVal.textContent = `C ${Math.round(inputs.clutch * 100)}%`;
  }

  startLoop() {
    const tick = () => {
      // Smoothly interpolate toward latest WebSocket telemetry sample
      const alpha = 0.35;
      this.current.throttle += (this.target.throttle - this.current.throttle) * alpha;
      this.current.brake += (this.target.brake - this.current.brake) * alpha;
      this.current.clutch += (this.target.clutch - this.current.clutch) * alpha;

      this.history.push({
        throttle: this.current.throttle,
        brake: this.current.brake,
        clutch: this.current.clutch,
      });
      if (this.history.length > this.maxSamples) {
        this.history.shift();
      }

      this.drawFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  drawFrame() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!ctx || w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    // Subtle horizontal grid lines (25%, 50%, 75%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75]) {
      const y = Math.round(h * frac) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (this.history.length < 2) return;

    const padY = 4;
    const usableH = Math.max(1, h - padY * 2);
    const stepX = w / (this.maxSamples - 1);
    const startX = w - (this.history.length - 1) * stepX;

    const drawCurve = (key, color, lineWidth) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      for (let i = 0; i < this.history.length; i++) {
        const x = startX + i * stepX;
        const y = h - padY - this.history[i][key] * usableH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawCurve('clutch', '#38bdf8', 1.6);
    drawCurve('brake', '#ef4444', 2.0);
    drawCurve('throttle', '#22c55e', 2.0);
  }
}
