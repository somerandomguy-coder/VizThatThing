import test from 'node:test';
import assert from 'node:assert/strict';
import { computePCA, computeUMAP, computeKMeans } from '../src/analysis/projections.js';

function makeThreeClusters(perCluster = 10, dim = 16) {
  const vectors = [];
  const centers = [
    new Array(dim).fill(0).map((_, i) => (i < 5 ? 5.0 : 0.0)),
    new Array(dim).fill(0).map((_, i) => (i >= 5 && i < 10 ? 5.0 : 0.0)),
    new Array(dim).fill(0).map((_, i) => (i >= 10 ? 5.0 : 0.0))
  ];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < perCluster; i++) {
      // Deterministic tiny jitter around cluster center
      const vec = new Float32Array(dim);
      for (let d = 0; d < dim; d++) {
        vec[d] = centers[c][d] + ((i * 7 + d * 13 + c * 3) % 11 - 5) * 0.04;
      }
      vectors.push(vec);
    }
  }
  return vectors;
}

test('computePCA handles small edge cases and extracts high-variance 2D coordinates', () => {
  const single = computePCA([new Float32Array([1, 2, 3, 4])]);
  assert.equal(single.coords.length, 1);
  assert.deepEqual(single.coords[0], [0, 0]);

  const vectors = makeThreeClusters(8, 16);
  const pca = computePCA(vectors);
  assert.equal(pca.coords.length, 24);
  assert.ok(pca.varianceExplained[0] >= pca.varianceExplained[1]);
  assert.ok(pca.varianceExplained[0] + pca.varianceExplained[1] > 80, 'Expected top 2 PCs to capture >80% of 3-cluster variance');

  for (const [x, y] of pca.coords) {
    assert.ok(x >= -1.0001 && x <= 1.0001);
    assert.ok(y >= -1.0001 && y <= 1.0001);
  }
});

test('computeUMAP produces deterministic 2D manifold preserving cluster compactness', () => {
  const tiny = computeUMAP([new Float32Array([1, 0]), new Float32Array([0, 1])]);
  assert.equal(tiny.coords.length, 2);

  const vectors = makeThreeClusters(10, 16);
  const run1 = computeUMAP(vectors, { nNeighbors: 8, minDist: 0.15, epochs: 120 });
  const run2 = computeUMAP(vectors, { nNeighbors: 8, minDist: 0.15, epochs: 120 });

  assert.equal(run1.coords.length, 30);
  // Deterministic check
  assert.deepEqual(run1.coords[0], run2.coords[0]);

  // Intra-cluster distance in 2D UMAP must be much smaller than inter-cluster distance
  const dist2d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let intra = 0;
  let intraCnt = 0;
  let inter = 0;
  let interCnt = 0;
  for (let i = 0; i < 30; i++) {
    for (let j = i + 1; j < 30; j++) {
      const same = Math.floor(i / 10) === Math.floor(j / 10);
      if (same) {
        intra += dist2d(run1.coords[i], run1.coords[j]);
        intraCnt++;
      } else {
        inter += dist2d(run1.coords[i], run1.coords[j]);
        interCnt++;
      }
    }
  }
  const meanIntra = intra / intraCnt;
  const meanInter = inter / interCnt;
  assert.ok(meanIntra < meanInter * 0.45, `Expected compact UMAP clusters: intra=${meanIntra} vs inter=${meanInter}`);
});

test('computeKMeans supports explicit k, auto-k silhouette selection, and medoid landmarks', () => {
  const vectors = makeThreeClusters(10, 16);
  const res = computeKMeans(vectors, { k: 'auto', maxK: 6 });

  assert.equal(res.k, 3, `Expected auto-k to select 3 clusters, got ${res.k}`);
  assert.equal(res.assignments.length, 30);
  assert.equal(res.medoidIndices.length, 3);
  assert.deepEqual([...res.counts].sort((a, b) => a - b), [10, 10, 10]);

  // Items in each synthetic block of 10 should share the same cluster assignment
  for (let c = 0; c < 3; c++) {
    const label = res.assignments[c * 10];
    for (let i = 1; i < 10; i++) {
      assert.equal(res.assignments[c * 10 + i], label);
    }
  }
});

