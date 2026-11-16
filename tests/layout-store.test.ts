import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LayoutStore, snapBounds } = require('../overlay/layout-store.cjs');

test('LayoutStore persists widget bounds and enabled state to config.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bestlap-layout-'));
  try {
    const store = new LayoutStore(tmpDir);
    assert.equal(store.getWidget('leaderboard')?.enabled, true);
    assert.equal(store.getWidget('relative')?.enabled, true);
    assert.equal(store.getWidget('inputs')?.enabled, true);

    store.updateWidgetBounds('leaderboard', { x: 120, y: 80, width: 600, height: 480 });
    store.setWidgetEnabled('inputs', false);

    const reloaded = new LayoutStore(tmpDir);
    assert.deepEqual(
      {
        x: reloaded.getWidget('leaderboard').x,
        y: reloaded.getWidget('leaderboard').y,
        width: reloaded.getWidget('leaderboard').width,
        height: reloaded.getWidget('leaderboard').height,
      },
      { x: 120, y: 80, width: 600, height: 480 }
    );
    assert.equal(reloaded.getWidget('inputs').enabled, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('snapBounds snaps magnetically to screen edges and sibling widgets', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const widgets = [
    { id: 'leaderboard', enabled: true, x: 24, y: 24, width: 560, height: 500 },
    { id: 'relative', enabled: true, x: 100, y: 600, width: 420, height: 250 },
  ];

  // Near left screen edge (x=8 <= 12)
  const snappedEdge = snapBounds(
    'relative',
    { x: 8, y: 600, width: 420, height: 250 },
    workArea,
    widgets,
    12
  );
  assert.equal(snappedEdge.x, 0);

  // Near right edge of leaderboard (24 + 560 = 584) and top edge (y=29 near 24)
  const snappedSibling = snapBounds(
    'relative',
    { x: 590, y: 29, width: 420, height: 250 },
    workArea,
    widgets,
    12
  );
  assert.equal(snappedSibling.x, 584);
  assert.equal(snappedSibling.y, 24);
});
