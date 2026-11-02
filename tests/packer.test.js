import test from 'node:test';
import assert from 'node:assert/strict';
import {
  packLayout,
  justifyLayout,
  scatterLayout,
  clusterIslandsLayout,
  colorMapLayout
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

