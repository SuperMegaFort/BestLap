const { contextBridge, ipcRenderer } = require('electron');

const params = new URLSearchParams(window.location.search);
const widgetId = params.get('widgetId') || null;

contextBridge.exposeInMainWorld('bestlapOverlay', {
  isDesktop: true,
  widgetId,

  onEditModeChanged(callback) {
    const handler = (_event, editMode) => callback(Boolean(editMode));
    ipcRenderer.on('bestlap:edit-mode', handler);
    return () => ipcRenderer.removeListener('bestlap:edit-mode', handler);
  },

  onLayoutUpdated(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('bestlap:layout-state', handler);
    return () => ipcRenderer.removeListener('bestlap:layout-state', handler);
  },

  getState() {
    return ipcRenderer.invoke('bestlap:get-state');
  },

  toggleEditMode() {
    return ipcRenderer.invoke('bestlap:toggle-edit-mode');
  },

  setWidgetEnabled(id, enabled) {
    return ipcRenderer.invoke('bestlap:set-widget-enabled', { id, enabled });
  },

  resetLayout() {
    return ipcRenderer.invoke('bestlap:reset-layout');
  },

  moveWidget(id, x, y, snap = true) {
    return ipcRenderer.invoke('bestlap:move-widget', { id, x, y, snap });
  },

  dragWidgetBy(id, dx, dy) {
    return ipcRenderer.invoke('bestlap:drag-widget-by', { id, dx, dy });
  },

  commitWidgetSnap(id) {
    return ipcRenderer.invoke('bestlap:commit-widget-snap', { id });
  },

  resizeWidget(id, width, height) {
    return ipcRenderer.invoke('bestlap:resize-widget', { id, width, height });
  },

  quitApp() {
    return ipcRenderer.invoke('bestlap:quit');
  },
});
