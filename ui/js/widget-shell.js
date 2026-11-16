/**
 * Initializes the detached widget chrome (edit mode border, magnetic drag, resize grip, hide button)
 * when running inside the BestLap Electron desktop shell.
 */
export function initDetachedWidgetShell(frameEl, defaultTitle = 'Widget') {
  const api = window.bestlapOverlay;
  if (!api?.isDesktop) {
    // Browser / OBS preview mode
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1') {
      document.body.classList.add('preview-mode');
    }
    return;
  }

  const editBar = document.createElement('div');
  editBar.className = 'widget-edit-bar';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = `${defaultTitle} — Drag to move`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'widget-close-btn';
  closeBtn.title = 'Hide widget';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (api.widgetId) api.setWidgetEnabled(api.widgetId, false);
  });

  editBar.append(titleSpan, closeBtn);
  frameEl.prepend(editBar);

  const grip = document.createElement('div');
  grip.className = 'widget-resize-grip';
  frameEl.appendChild(grip);

  api.onEditModeChanged((editMode) => {
    document.body.classList.toggle('edit-mode', editMode);
  });

  // Incremental client-coordinate drag (avoids X11/Wayland screenX & -webkit-app-region issues)
  let dragging = false;
  let downClientX = 0;
  let downClientY = 0;

  editBar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    downClientX = e.clientX;
    downClientY = e.clientY;
    editBar.setPointerCapture(e.pointerId);
  });

  editBar.addEventListener('pointermove', (e) => {
    if (!dragging || !api.widgetId) return;
    const dx = e.clientX - downClientX;
    const dy = e.clientY - downClientY;
    if (dx !== 0 || dy !== 0) {
      api.dragWidgetBy(api.widgetId, dx, dy);
    }
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (api.widgetId) api.commitWidgetSnap(api.widgetId);
  };
  editBar.addEventListener('pointerup', endDrag);
  editBar.addEventListener('pointercancel', endDrag);

  // Resize via bottom-right grip using client coordinates (works on X11 & Wayland)
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let startW = 0;
  let startH = 0;

  grip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    startW = window.innerWidth;
    startH = window.innerHeight;
    grip.setPointerCapture(e.pointerId);
  });

  grip.addEventListener('pointermove', (e) => {
    if (!resizing || !api.widgetId) return;
    const nextW = startW + (e.clientX - resizeStartX);
    const nextH = startH + (e.clientY - resizeStartY);
    api.resizeWidget(api.widgetId, nextW, nextH);
  });

  grip.addEventListener('pointerup', () => {
    resizing = false;
  });
}
