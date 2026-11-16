const STORAGE_KEY = 'bestlap.layout.v1';

/**
 * Manages widget positioning, drag-to-move when unlocked, and layout persistence.
 */
export class WidgetManager {
  constructor() {
    this.unlocked = false;
    this.shells = [];
    this.savedLayout = this.loadLayout();
  }

  loadLayout() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  saveLayout() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedLayout));
    } catch {
      // Ignore storage quota errors
    }
  }

  register(id, shellEl, defaultPos = { x: 24, y: 24 }) {
    const pos = this.savedLayout[id] ?? defaultPos;
    shellEl.style.left = `${pos.x}px`;
    shellEl.style.top = `${pos.y}px`;
    this.shells.push({ id, el: shellEl });
    this.attachDragHandlers(id, shellEl);
  }

  setUnlocked(unlocked) {
    this.unlocked = unlocked;
    for (const { el } of this.shells) {
      el.classList.toggle('unlocked', unlocked);
    }
  }

  attachDragHandlers(id, shellEl) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    shellEl.addEventListener('pointerdown', (e) => {
      if (!this.unlocked) return;
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(shellEl.style.left) || 0;
      origTop = parseFloat(shellEl.style.top) || 0;
      shellEl.setPointerCapture(e.pointerId);
    });

    shellEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const nextX = Math.max(0, origLeft + (e.clientX - startX));
      const nextY = Math.max(0, origTop + (e.clientY - startY));
      shellEl.style.left = `${nextX}px`;
      shellEl.style.top = `${nextY}px`;
    });

    shellEl.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      this.savedLayout[id] = {
        x: parseFloat(shellEl.style.left) || 0,
        y: parseFloat(shellEl.style.top) || 0,
      };
      this.saveLayout();
    });
  }
}
