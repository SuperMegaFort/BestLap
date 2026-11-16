const { spawn } = require('node:child_process');
const path = require('node:path');
const { app, globalShortcut, ipcMain, Menu, nativeImage, Tray } = require('electron');
const { LayoutStore } = require('./layout-store.cjs');
const { OverlayWindowManager } = require('./window-manager.cjs');

// Essential Linux flags for transparent, composited overlays.
// Default to 'x11' (XWayland on Wayland sessions) because native Wayland forbids
// client-side window positioning (setBounds), global shortcuts, and click-through.
// Disable hardware acceleration by default on Linux to avoid Electron GPU process
// segfaults (exit_code=139) under XWayland + transparent visuals.
if (process.platform === 'linux' && process.env.BESTLAP_ENABLE_GPU !== '1') {
  app.disableHardwareAcceleration();
}
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('ozone-platform', process.env.BESTLAP_OZONE_PLATFORM || 'x11');

const OVERLAY_URL = process.env.BESTLAP_OVERLAY_URL || 'http://127.0.0.1:7777';

let backendProcess = null;
let windowManager = null;
let tray = null;

async function isBackendReachable(url) {
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBackendRunning() {
  if (await isBackendReachable(OVERLAY_URL)) {
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const entryScript = path.join(rootDir, 'src', 'index.ts');
  const passThroughArgs = process.argv.filter(
    (arg) => arg === '--mock' || arg.startsWith('--provider=') || arg.startsWith('--port=')
  );

  backendProcess = spawn('node', [entryScript, ...passThroughArgs], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  // Wait up to 3s for HTTP/WS server to become ready
  for (let i = 0; i < 30; i++) {
    if (await isBackendReachable(OVERLAY_URL)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

function buildTray(layoutStore) {
  try {
    // Minimal 16x16 cyan PNG data URL for Linux tray compatibility without external asset files
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVR42mNgGAU0B4wMDAx/GhgY/jMwMPxnYGD4z8jAwPAfSAO5QGwKxI5AbArEpkBsCsSmQGwKxKZAbArEpkBsCsSmQGwKxKZAbArEpkBsCsSmQGwKQAAAN3QNAZ1tQ0UAAAAASUVORK5CYII='
    );
    tray = new Tray(icon);
    tray.setToolTip('BestLap Sim-Racing Overlay');

    const refreshMenu = () => {
      const editMode = windowManager?.editMode ?? false;
      const widgetItems = layoutStore.getAllWidgets().map((w) => ({
        label: `Widget: ${w.title}`,
        type: 'checkbox',
        checked: w.enabled,
        click: (item) => windowManager?.setWidgetEnabled(w.id, item.checked),
      }));

      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: editMode ? 'Lock Overlay (Click-Through) [Alt+Shift+L]' : 'Edit Layout [Alt+Shift+L]',
            click: () => windowManager?.toggleEditMode(),
          },
          { type: 'separator' },
          ...widgetItems,
          { type: 'separator' },
          { label: 'Reset Layout', click: () => windowManager?.resetLayout() },
          { label: 'Quit BestLap', click: () => app.quit() },
        ])
      );
    };

    refreshMenu();
    return refreshMenu;
  } catch {
    return () => {};
  }
}

function registerIpc(refreshTray) {
  ipcMain.handle('bestlap:get-state', () => windowManager?.getState() ?? null);

  ipcMain.handle('bestlap:toggle-edit-mode', () => {
    const next = windowManager?.toggleEditMode() ?? false;
    refreshTray();
    return next;
  });

  ipcMain.handle('bestlap:set-widget-enabled', (_event, { id, enabled }) => {
    const updated = windowManager?.setWidgetEnabled(id, enabled) ?? null;
    refreshTray();
    return updated;
  });

  ipcMain.handle('bestlap:reset-layout', () => {
    windowManager?.resetLayout();
    refreshTray();
    return windowManager?.getState() ?? null;
  });

  ipcMain.handle('bestlap:move-widget', (_event, { id, x, y, snap }) => {
    return windowManager?.moveWidget(id, x, y, snap) ?? null;
  });

  ipcMain.handle('bestlap:drag-widget-by', (_event, { id, dx, dy }) => {
    return windowManager?.dragWidgetBy(id, dx, dy) ?? null;
  });

  ipcMain.handle('bestlap:commit-widget-snap', (_event, { id }) => {
    return windowManager?.commitWidgetSnap(id) ?? null;
  });

  ipcMain.handle('bestlap:resize-widget', (_event, { id, width, height }) => {
    return windowManager?.resizeWidget(id, width, height) ?? null;
  });

  ipcMain.handle('bestlap:quit', () => {
    app.quit();
  });
}

app.whenReady().then(async () => {
  await ensureBackendRunning();

  const layoutStore = new LayoutStore();
  windowManager = new OverlayWindowManager({
    baseUrl: OVERLAY_URL,
    layoutStore,
  });

  const refreshTray = buildTray(layoutStore);
  registerIpc(refreshTray);

  // Brief delay helps Linux compositors initialize ARGB visuals cleanly
  setTimeout(() => {
    windowManager.initAll();
    refreshTray();
  }, 150);

  const shortcutOk = globalShortcut.register('Alt+Shift+L', () => {
    windowManager?.toggleEditMode();
    refreshTray();
  });
  console.log(`[BestLap Overlay] Shortcut Alt+Shift+L registered: ${shortcutOk}`);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  windowManager?.destroyAll();
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
