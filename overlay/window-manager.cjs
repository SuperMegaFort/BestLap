const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { snapBounds } = require('./layout-store.cjs');

class OverlayWindowManager {
  constructor({ baseUrl, layoutStore }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.layoutStore = layoutStore;
    this.windows = new Map(); // widgetId -> BrowserWindow
    this.dockWindow = null;
    this.editMode = false;
  }

  initAll() {
    for (const widget of this.layoutStore.getAllWidgets()) {
      if (widget.enabled) {
        this.createWidgetWindow(widget);
      }
    }
    this.createDockWindow();
    this.broadcastState();
  }

  createWidgetWindow(widget) {
    if (this.windows.has(widget.id)) {
      return this.windows.get(widget.id);
    }

    const win = new BrowserWindow({
      x: widget.x,
      y: widget.y,
      width: widget.width,
      height: widget.height,
      minWidth: widget.minWidth,
      minHeight: widget.minHeight,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: this.editMode,
      focusable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(!this.editMode, { forward: true });
    if (!this.editMode) {
      win.setFocusable(false);
    }
    win.setOpacity(widget.opacity ?? 0.95);

    const url = `${this.baseUrl}${widget.route}?widgetId=${encodeURIComponent(widget.id)}`;
    win.loadURL(url);

    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      win.showInactive();
    });

    win.webContents.on('did-finish-load', () => {
      win.webContents.send('bestlap:edit-mode', this.editMode);
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[BestLap Overlay] Failed to load ${widget.id} (${validatedURL}): ${errorCode} ${errorDescription}`);
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[BestLap Overlay] Renderer gone for ${widget.id}: ${details.reason}`);
    });

    let saveTimer = null;
    let snapping = false;
    const scheduleSave = () => {
      if (snapping) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (win.isDestroyed()) return;
        const current = win.getBounds();
        const display = screen.getDisplayMatching(current);
        const snapped = snapBounds(
          widget.id,
          current,
          display.workArea,
          this.layoutStore.getAllWidgets(),
          this.layoutStore.data.snapThresholdPx
        );
        if (snapped.x !== current.x || snapped.y !== current.y) {
          snapping = true;
          win.setBounds(snapped);
          setTimeout(() => {
            snapping = false;
          }, 50);
        }
        this.layoutStore.updateWidgetBounds(widget.id, snapped);
        this.broadcastState();
      }, 120);
    };

    win.on('moved', scheduleSave);
    win.on('resized', scheduleSave);
    win.on('closed', () => {
      if (saveTimer) clearTimeout(saveTimer);
      this.windows.delete(widget.id);
    });

    this.windows.set(widget.id, win);
    return win;
  }

  createDockWindow() {
    if (this.dockWindow && !this.dockWindow.isDestroyed()) {
      return this.dockWindow;
    }

    const display = screen.getPrimaryDisplay();
    const { width: screenW } = display.workAreaSize;
    const dockW = 340;
    const dockH = 390;

    const dock = new BrowserWindow({
      x: Math.round((screenW - dockW) / 2),
      y: 28,
      width: dockW,
      height: dockH,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    dock.setAlwaysOnTop(true, 'screen-saver');
    dock.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    dock.loadURL(`${this.baseUrl}/control-panel.html`);

    dock.once('ready-to-show', () => {
      if (!dock.isDestroyed()) {
        dock.show();
      }
    });

    dock.webContents.on('did-finish-load', () => {
      this.broadcastState();
    });

    dock.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[BestLap Overlay] Failed to load dock (${validatedURL}): ${errorCode} ${errorDescription}`);
    });

    dock.on('closed', () => {
      this.dockWindow = null;
    });

    this.dockWindow = dock;
    return dock;
  }

  setEditMode(nextEditMode) {
    this.editMode = Boolean(nextEditMode);

    for (const win of this.windows.values()) {
      if (win.isDestroyed()) continue;
      if (this.editMode) {
        win.setFocusable(true);
        win.setIgnoreMouseEvents(false);
        win.setResizable(true);
        win.setAlwaysOnTop(true, 'screen-saver');
        win.showInactive();
      } else {
        win.setResizable(false);
        win.setIgnoreMouseEvents(true, { forward: true });
        win.setFocusable(false);
      }
      win.webContents.send('bestlap:edit-mode', this.editMode);
    }

    if (this.dockWindow && !this.dockWindow.isDestroyed()) {
      this.dockWindow.show();
      if (this.editMode) {
        this.dockWindow.focus();
      }
    }

    this.broadcastState();
    return this.editMode;
  }

  toggleEditMode() {
    return this.setEditMode(!this.editMode);
  }

  setWidgetEnabled(id, enabled) {
    const widget = this.layoutStore.setWidgetEnabled(id, enabled);
    if (!widget) return null;

    if (widget.enabled) {
      this.createWidgetWindow(widget);
    } else {
      const win = this.windows.get(id);
      if (win && !win.isDestroyed()) {
        win.close();
      }
      this.windows.delete(id);
    }

    this.broadcastState();
    return widget;
  }

  moveWidget(id, x, y, snap = true) {
    const win = this.windows.get(id);
    const widget = this.layoutStore.getWidget(id);
    if (!win || win.isDestroyed() || !widget) return null;

    const current = win.getBounds();
    let target = { x, y, width: current.width, height: current.height };

    if (snap) {
      const display = screen.getDisplayMatching(current);
      target = snapBounds(
        id,
        target,
        display.workArea,
        this.layoutStore.getAllWidgets(),
        this.layoutStore.data.snapThresholdPx
      );
    }

    win.setBounds(target);
    const updated = this.layoutStore.updateWidgetBounds(id, target);
    this.broadcastState();
    return updated;
  }

  dragWidgetBy(id, dx, dy) {
    const win = this.windows.get(id);
    if (!win || win.isDestroyed()) return null;
    const current = win.getBounds();
    const nextX = Math.round(current.x + dx);
    const nextY = Math.round(current.y + dy);
    win.setBounds({ x: nextX, y: nextY, width: current.width, height: current.height });
    return { x: nextX, y: nextY };
  }

  commitWidgetSnap(id) {
    const win = this.windows.get(id);
    if (!win || win.isDestroyed()) return null;
    const current = win.getBounds();
    const display = screen.getDisplayMatching(current);
    const snapped = snapBounds(
      id,
      current,
      display.workArea,
      this.layoutStore.getAllWidgets(),
      this.layoutStore.data.snapThresholdPx
    );
    win.setBounds(snapped);
    const updated = this.layoutStore.updateWidgetBounds(id, snapped);
    this.broadcastState();
    return updated;
  }

  resizeWidget(id, width, height) {
    const win = this.windows.get(id);
    const widget = this.layoutStore.getWidget(id);
    if (!win || win.isDestroyed() || !widget) return null;

    const current = win.getBounds();
    const clampedW = Math.max(widget.minWidth, Math.round(width));
    const clampedH = Math.max(widget.minHeight, Math.round(height));
    win.setBounds({ x: current.x, y: current.y, width: clampedW, height: clampedH });
    const updated = this.layoutStore.updateWidgetBounds(id, { width: clampedW, height: clampedH });
    this.broadcastState();
    return updated;
  }

  resetLayout() {
    this.layoutStore.reset();
    for (const widget of this.layoutStore.getAllWidgets()) {
      const existing = this.windows.get(widget.id);
      if (widget.enabled) {
        if (existing && !existing.isDestroyed()) {
          existing.setBounds({
            x: widget.x,
            y: widget.y,
            width: widget.width,
            height: widget.height,
          });
        } else {
          this.createWidgetWindow(widget);
        }
      } else if (existing && !existing.isDestroyed()) {
        existing.close();
      }
    }
    this.broadcastState();
  }

  getState() {
    return {
      editMode: this.editMode,
      configPath: this.layoutStore.configPath,
      widgets: this.layoutStore.getAllWidgets(),
    };
  }

  broadcastState() {
    const state = this.getState();
    if (this.dockWindow && !this.dockWindow.isDestroyed()) {
      this.dockWindow.webContents.send('bestlap:layout-state', state);
    }
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send('bestlap:layout-state', state);
      }
    }
  }

  destroyAll() {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.windows.clear();
    if (this.dockWindow && !this.dockWindow.isDestroyed()) {
      this.dockWindow.destroy();
      this.dockWindow = null;
    }
  }
}

module.exports = { OverlayWindowManager };
