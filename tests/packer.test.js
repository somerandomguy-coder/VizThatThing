import test from 'node:test';
import assert from 'node:assert/strict';
import {
  packLayout,
  justifyLayout,
  scatterLayout,
  clusterIslandsLayout,
  colorMapLayout,
  applyCustomPositions,
  applyRelativeScale,
  getStringColor
} from '../src/packer.js';

function makeMockItems(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    name: `img_${i}.png`,
    fullPath: `train/img_${i}.png`,
    width: i % 2 === 0 ? 400 : 300,
    height: i % 2 === 0 ? 300 : 400,
    pca: [((i % 4) - 1.5) / 1.5, (Math.floor(i / 4) - 1) / 1.5],
    umap: [Math.cos(i), Math.sin(i)],
    clusterId: i % 3,
    isMedoid: i < 3,
    analysis: {
      dominantHex: '#dc2626',
      primaryHsl: { h: (i * 30) % 360, s: 0.7, l: 0.2 + (i / n) * 0.6 },
      photo: { brightness: 40 + i * 15, temperature: -0.6 + (i / n) * 1.2 },
      themes: ['Warm']
    }
  }));
}

test('packLayout and justifyLayout position all items within positive bounds', () => {
  const items = makeMockItems(10);
  const packed = packLayout(items, 120, 4);
  assert.equal(packed.items.length, 10);
  assert.ok(packed.width > 0 && packed.height > 0);

  const justified = justifyLayout(items, 900, 120, 4);
  assert.equal(justified.items.length, 10);
  assert.equal(justified.width, 900);
  assert.ok(justified.height > 0);
});

test('scatterLayout maps 2D coordinates, preserves pointX/pointY, and identifies cluster landmarks', () => {
  const items = makeMockItems(12);
  const res = scatterLayout(items, 'pca', { thumbSize: 80, relaxOverlaps: true, xLabel: 'PC 1', yLabel: 'PC 2' });

  assert.equal(res.items.length, 12);
  assert.equal(res.mode, 'scatter');
  assert.ok(res.landmarks.length === 3, `Expected 3 cluster landmarks, got ${res.landmarks.length}`);
  assert.equal(res.axes.xLabel, 'PC 1');

  for (const li of res.items) {
    assert.ok(Number.isFinite(li.x) && Number.isFinite(li.y));
    assert.ok(Number.isFinite(li.pointX) && Number.isFinite(li.pointY));
    assert.ok(li.w > 0 && li.h > 0);
  }
});

test('clusterIslandsLayout builds distinct cluster islands with headers and counts', () => {
  const items = makeMockItems(12);
  const res = clusterIslandsLayout(items, 100, 6);

  assert.equal(res.items.length, 12);
  assert.equal(res.islands.length, 3);
  for (const island of res.islands) {
    assert.equal(island.count, 4);
    assert.ok(island.w > 0 && island.h > 0);
    assert.ok(island.medoidItem !== null);
  }
});

test('colorMapLayout arranges items along Hue x Luminance plane', () => {
  const items = makeMockItems(12);
  const res = colorMapLayout(items, { thumbSize: 80, axesMode: 'hue-lum' });

  assert.equal(res.items.length, 12);
  assert.equal(res.mode, 'colormap');
  assert.ok(res.axes.xLabel.includes('Hue'));
  // Brighter items (higher l) should sit higher up (smaller y) than darker items
  const darkest = res.items.find((li) => li.item.name === 'img_0.png');
  const brightest = res.items.find((li) => li.item.name === 'img_11.png');
  assert.ok(brightest.pointY < darkest.pointY, 'Expected brighter image at smaller Y (higher on canvas)');
});

test('applyCustomPositions overrides coordinates while preserving baseX/baseY for Tidy resets', () => {
  const items = makeMockItems(4);
  items[1].customPos = { x: 1850, y: 920 };
  const baseLayout = packLayout(items, 100, 6);
  const origX = baseLayout.items.find((li) => li.item === items[1]).x;

  const layered = applyCustomPositions(baseLayout);
  const moved = layered.items.find((li) => li.item === items[1]);
  assert.equal(moved.baseX, origX);
  assert.equal(moved.x, 1850);
  assert.equal(moved.y, 920);
  assert.ok(layered.width >= 1850 + moved.w);
  assert.ok(layered.height >= 920 + moved.h);

  // Clearing customPos and re-applying snaps back to baseX
  items[1].customPos = null;
  const tidied = applyCustomPositions(packLayout(items, 100, 6));
  assert.equal(tidied.items.find((li) => li.item === items[1]).x, origX);
  assert.ok(getStringColor('keepers').startsWith('#'));
});

test('applyRelativeScale keeps true size ratios across pack, grid and scatter', () => {
  const items = [
    { name: 'big.jpg', fullPath: 'big.jpg', width: 2048, height: 1536 },
    { name: 'half.jpg', fullPath: 'half.jpg', width: 1024, height: 768 },
    { name: 'tall.jpg', fullPath: 'tall.jpg', width: 768, height: 1024 }
  ];

  applyRelativeScale(items, true);
  assert.equal(items[0].displayScale, 1);
  assert.equal(items[1].displayScale, 0.5);
  assert.equal(items[2].displayScale, 0.5);

  const byName = (layout) => Object.fromEntries(layout.items.map((li) => [li.item.name, li]));

  const pack = byName(packLayout(items, 200, 4));
  assert.equal(pack['big.jpg'].w, 200);
  assert.equal(pack['half.jpg'].w, 100);
  assert.equal(pack['tall.jpg'].h, 100);

  const grid = byName(justifyLayout(items, 1200, 150, 4));
  assert.ok(Math.abs(grid['half.jpg'].w * 2 - grid['big.jpg'].w) <= 2);

  const scatter = byName(scatterLayout(items, 'pca', { thumbSize: 120 }));
  assert.equal(scatter['half.jpg'].w * 2, scatter['big.jpg'].w);

  applyRelativeScale(items, false);
  const uniform = byName(packLayout(items, 200, 4));
  assert.equal(uniform['half.jpg'].w, 200);
});
