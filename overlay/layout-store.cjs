const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG = {
  version: 1,
  snapThresholdPx: 12,
  widgets: {
    leaderboard: {
      id: 'leaderboard',
      title: 'Leaderboard',
      route: '/widgets/leaderboard.html',
      enabled: true,
      x: 24,
      y: 24,
      width: 564,
      height: 510,
      minWidth: 420,
      minHeight: 220,
      opacity: 0.95,
    },
    relative: {
      id: 'relative',
      title: 'Relative',
      route: '/widgets/relative.html',
      enabled: true,
      x: 24,
      y: 550,
      width: 420,
      height: 256,
      minWidth: 320,
      minHeight: 160,
      opacity: 0.95,
    },
    inputs: {
      id: 'inputs',
      title: 'Input Telemetry',
      route: '/widgets/inputs.html',
      enabled: true,
      x: 460,
      y: 550,
      width: 320,
      height: 152,
      minWidth: 240,
      minHeight: 120,
      opacity: 0.95,
    },
    'input-graph': {
      id: 'input-graph',
      title: 'Input Graph (60 FPS)',
      route: '/widgets/input-graph.html',
      enabled: true,
      x: 460,
      y: 714,
      width: 380,
      height: 148,
      minWidth: 260,
      minHeight: 110,
      opacity: 0.95,
    },
    strategy: {
      id: 'strategy',
      title: 'Strategy & Tires HUD',
      route: '/widgets/strategy.html',
      enabled: true,
      x: 1380,
      y: 24,
      width: 360,
      height: 290,
      minWidth: 300,
      minHeight: 240,
      opacity: 0.95,
    },
    trackmap: {
      id: 'trackmap',
      title: 'Track Map',
      route: '/widgets/trackmap.html',
      enabled: true,
      x: 1380,
      y: 330,
      width: 360,
      height: 300,
      minWidth: 220,
      minHeight: 200,
      opacity: 0.95,
    },
  },
};

function getDefaultConfigDir() {
  if (process.env.BESTLAP_CONFIG_DIR) {
    return process.env.BESTLAP_CONFIG_DIR;
  }
  if (process.platform === 'linux') {
    return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'bestlap');
  }
  return path.join(os.homedir(), '.bestlap');
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

class LayoutStore {
  constructor(configDir = getDefaultConfigDir()) {
    this.configDir = configDir;
    this.configPath = path.join(configDir, 'config.json');
    this.data = this.load();
  }

  load() {
    const defaults = cloneDefaults();
    try {
      if (!fs.existsSync(this.configPath)) {
        return defaults;
      }
      const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      const merged = {
        ...defaults,
        snapThresholdPx:
          typeof parsed.snapThresholdPx === 'number'
            ? parsed.snapThresholdPx
            : defaults.snapThresholdPx,
        widgets: { ...defaults.widgets },
      };

      for (const [id, def] of Object.entries(defaults.widgets)) {
        const saved = parsed.widgets?.[id];
        if (saved && typeof saved === 'object') {
          merged.widgets[id] = {
            ...def,
            enabled: typeof saved.enabled === 'boolean' ? saved.enabled : def.enabled,
            x: Number.isFinite(saved.x) ? Math.round(saved.x) : def.x,
            y: Number.isFinite(saved.y) ? Math.round(saved.y) : def.y,
            width: Number.isFinite(saved.width)
              ? Math.max(def.minWidth, Math.round(saved.width))
              : def.width,
            height: Number.isFinite(saved.height)
              ? Math.max(def.minHeight, Math.round(saved.height))
              : def.height,
            opacity:
              typeof saved.opacity === 'number'
                ? Math.max(0.2, Math.min(1, saved.opacity))
                : def.opacity,
          };
        }
      }
      return merged;
    } catch {
      return defaults;
    }
  }

  save() {
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2) + '\n', 'utf8');
  }

  getAllWidgets() {
    return Object.values(this.data.widgets);
  }

  getWidget(id) {
    return this.data.widgets[id] || null;
  }

  updateWidgetBounds(id, bounds) {
    const widget = this.data.widgets[id];
    if (!widget) return null;

    if (Number.isFinite(bounds.x)) widget.x = Math.round(bounds.x);
    if (Number.isFinite(bounds.y)) widget.y = Math.round(bounds.y);
    if (Number.isFinite(bounds.width)) {
      widget.width = Math.max(widget.minWidth, Math.round(bounds.width));
    }
    if (Number.isFinite(bounds.height)) {
      widget.height = Math.max(widget.minHeight, Math.round(bounds.height));
    }

    this.save();
    return widget;
  }

  setWidgetEnabled(id, enabled) {
    const widget = this.data.widgets[id];
    if (!widget) return null;
    widget.enabled = Boolean(enabled);
    this.save();
    return widget;
  }

  reset() {
    this.data = cloneDefaults();
    this.save();
    return this.data;
  }
}

/**
 * Magnetically snaps candidate { x, y, width, height } to screen workArea edges
 * and to other enabled widget edges within `threshold` pixels.
 */
function snapBounds(id, bounds, workArea, widgets, threshold = 12) {
  let { x, y, width, height } = bounds;

  const xTargets = [
    workArea.x,
    workArea.x + workArea.width - width,
  ];
  const yTargets = [
    workArea.y,
    workArea.y + workArea.height - height,
  ];

  for (const other of widgets) {
    if (!other.enabled || other.id === id) continue;
    // Snap left edge to other's left or right edge
    xTargets.push(other.x, other.x + other.width);
    // Snap right edge to other's left or right edge
    xTargets.push(other.x - width, other.x + other.width - width);

    // Snap top edge to other's top or bottom edge
    yTargets.push(other.y, other.y + other.height);
    // Snap bottom edge to other's top or bottom edge
    yTargets.push(other.y - height, other.y + other.height - height);
  }

  let bestDx = threshold + 1;
  let snappedX = x;
  for (const target of xTargets) {
    const dx = Math.abs(x - target);
    if (dx < bestDx) {
      bestDx = dx;
      snappedX = target;
    }
  }

  let bestDy = threshold + 1;
  let snappedY = y;
  for (const target of yTargets) {
    const dy = Math.abs(y - target);
    if (dy < bestDy) {
      bestDy = dy;
      snappedY = target;
    }
  }

  return { x: Math.round(snappedX), y: Math.round(snappedY), width, height };
}

module.exports = {
  DEFAULT_CONFIG,
  LayoutStore,
  getDefaultConfigDir,
  snapBounds,
};
