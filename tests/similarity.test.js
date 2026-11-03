import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cosineSimilarity,
  getActiveEmbedding,
  findSimilarToAnchor,
  arrangePulledNeighbors,
  packSelectedSubgroup
} from '../src/analysis/similarity.js';

test('cosineSimilarity computes normalized dot product and handles zero vectors safely', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-6);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1]) - 0) < 1e-6);
  assert.ok(Math.abs(cosineSimilarity([2, 2], [-3, -3]) - -1) < 1e-6);
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test('getActiveEmbedding supports Float32Array analysis.vector and prefers CLIP when requested', () => {
  const f32 = new Float32Array([0.1, 0.9]);
  const clipF32 = new Float32Array([0.8, 0.2, 0.1]);
  const item = {
    analysis: { vector: f32 },
    ai: { embedding: clipF32 }
  };
  assert.equal(getActiveEmbedding(item, 'clip'), clipF32);
  assert.equal(getActiveEmbedding(item, 'visual'), f32);
  assert.deepEqual(getActiveEmbedding({ analysis: { featureVector: [0.4, 0.6] }, ai: {} }, 'clip'), [0.4, 0.6]);
});

test('findSimilarToAnchor skips candidates already inside neighborRadius so repeated right-clicks pull next batch', () => {
  const anchor = {
    fullPath: 'anchor.jpg',
    analysis: { featureVector: [1, 0, 0] }
  };

  // Build 12 candidates sorted by decreasing similarity to [1, 0, 0]
  const candidates = Array.from({ length: 12 }, (_, idx) => {
    const angle = (idx + 1) * 0.08;
    return {
      fullPath: `cand_${idx}.jpg`,
      analysis: { featureVector: [Math.cos(angle), Math.sin(angle), 0] }
    };
  });

  const allItems = [anchor, ...candidates];

  // Initially all candidates sit far away at x = 2000, while anchor is at (100, 100)
  const layoutLookup = new Map();
  layoutLookup.set('anchor.jpg', { x: 50, y: 50, w: 100, h: 100 });
  for (const c of candidates) {
    layoutLookup.set(c.fullPath, { x: 2000, y: 2000, w: 100, h: 100 });
  }

  const firstPull = findSimilarToAnchor(anchor, allItems, layoutLookup, {
    count: 5,
    neighborRadius: 320,
    embeddingSource: 'visual'
  });

  assert.equal(firstPull.length, 5);
  assert.deepEqual(
    firstPull.map((r) => r.item.fullPath),
    ['cand_0.jpg', 'cand_1.jpg', 'cand_2.jpg', 'cand_3.jpg', 'cand_4.jpg']
  );

  // Move the first 5 pulled items next to the anchor (inside radius 320)
  for (let i = 0; i < 5; i++) {
    layoutLookup.set(`cand_${i}.jpg`, { x: 170, y: 60 + i * 20, w: 100, h: 100 });
  }

  // Second right-click automatically skips cand_0..4 and pulls cand_5..9!
  const secondPull = findSimilarToAnchor(anchor, allItems, layoutLookup, {
    count: 5,
    neighborRadius: 320,
    embeddingSource: 'visual'
  });

  assert.equal(secondPull.length, 5);
  assert.deepEqual(
    secondPull.map((r) => r.item.fullPath),
    ['cand_5.jpg', 'cand_6.jpg', 'cand_7.jpg', 'cand_8.jpg', 'cand_9.jpg']
  );
});

function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('arrangePulledNeighbors places pulled items around anchor without overlapping anchor or occupied neighbors', () => {
  const anchorBox = { x: 400, y: 400, w: 120, h: 120 };
  const batch1 = Array.from({ length: 5 }, (_, i) => ({
    fullPath: `b1_${i}.jpg`,
    width: 200,
    height: 200
  }));
  const batch2 = Array.from({ length: 5 }, (_, i) => ({
    fullPath: `b2_${i}.jpg`,
    width: 240,
    height: 160
  }));

  const placed1 = arrangePulledNeighbors(anchorBox, batch1, [], 120, 8);
  assert.equal(placed1.length, 5);

  const occupied = [anchorBox, ...placed1];
  for (let i = 0; i < occupied.length; i++) {
    for (let j = i + 1; j < occupied.length; j++) {
      assert.equal(boxesOverlap(occupied[i], occupied[j]), false, `Batch 1 overlap between ${i} and ${j}`);
    }
  }

  const placed2 = arrangePulledNeighbors(anchorBox, batch2, placed1, 120, 8);
  assert.equal(placed2.length, 5);

  const allOccupied = [...occupied, ...placed2];
  for (let i = 0; i < allOccupied.length; i++) {
    for (let j = i + 1; j < allOccupied.length; j++) {
      assert.equal(boxesOverlap(allOccupied[i], allOccupied[j]), false, `Batch 2 overlap between ${i} and ${j}`);
    }
  }
});

test('packSelectedSubgroup organizes heavily stacked items into non-overlapping layout centered at selection midpoint', () => {
  // 6 items stacked almost directly on top of (500, 300)
  const stacked = Array.from({ length: 6 }, (_, i) => ({
    item: { fullPath: `s_${i}.jpg`, width: 200, height: 150 },
    x: 500 + (i % 2) * 3,
    y: 300 + (i % 3) * 2,
    w: 120,
    h: 90
  }));

  const packed = packSelectedSubgroup(stacked, 120, 6);
  assert.equal(packed.length, 6);

  for (let i = 0; i < packed.length; i++) {
    for (let j = i + 1; j < packed.length; j++) {
      assert.equal(boxesOverlap(packed[i], packed[j]), false, `Packed overlap between ${i} and ${j}`);
    }
  }

  // Midpoint should remain close to original stack center (~560, ~345)
  const minX = Math.min(...packed.map((p) => p.x));
  const maxX = Math.max(...packed.map((p) => p.x + p.w));
  const minY = Math.min(...packed.map((p) => p.y));
  const maxY = Math.max(...packed.map((p) => p.y + p.h));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  assert.ok(Math.abs(midX - 561.5) < 40);
  assert.ok(Math.abs(midY - 346) < 40);
});
