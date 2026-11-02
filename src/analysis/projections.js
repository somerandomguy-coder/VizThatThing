// Deterministic 2D PCA, PCA-initialized UMAP, and K-Means++ with Auto-k Silhouette

function createSeededRng(seed = 42) {
  let state = seed >>> 0;
  return function nextRandom() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function squaredEuclidean(a, b) {
  let sum = 0;
  const len = a.length;
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function normalizeCoords2D(coords) {
  const n = coords.length;
  if (n === 0) return [];
  if (n === 1) return [[0, 0]];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < n; i++) {
    const x = coords[i][0];
    const y = coords[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = (maxX - minX) / 2;
  const spanY = (maxY - minY) / 2;
  const maxSpan = Math.max(spanX, spanY, 1e-9);

  return coords.map(([x, y]) => [
    Number(((x - cx) / maxSpan).toFixed(5)),
    Number(((y - cy) / maxSpan).toFixed(5))
  ]);
}

/**
 * Matrix-free Power Iteration PCA (O(N * D) per step — works fast on both 64-dim and 512-dim CLIP vectors).
 */
export function computePCA(vectors) {
  const n = vectors.length;
  if (n === 0) return { coords: [], varianceExplained: [0, 0] };
  if (n === 1) return { coords: [[0, 0]], varianceExplained: [100, 0] };

  const dim = vectors[0].length;
  const mean = new Float64Array(dim);

  for (let i = 0; i < n; i++) {
    const v = vectors[i];
    for (let d = 0; d < dim; d++) {
      mean[d] += v[d];
    }
  }
  for (let d = 0; d < dim; d++) mean[d] /= n;

  const centered = new Array(n);
  let totalVar = 0;
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(dim);
    const v = vectors[i];
    for (let d = 0; d < dim; d++) {
      const val = v[d] - mean[d];
      row[d] = val;
      totalVar += val * val;
    }
    centered[i] = row;
  }

  if (totalVar < 1e-12) {
    return {
      coords: vectors.map((_, idx) => [Number((((idx / Math.max(1, n - 1)) * 2) - 1).toFixed(5)), 0]),
      varianceExplained: [0, 0]
    };
  }

  function findPrincipalAxis(data, orthoVec = null) {
    const v = new Float64Array(dim);
    for (let d = 0; d < dim; d++) {
      v[d] = Math.sin((d + 1) * 1.73205 + (orthoVec ? 0.9 : 0.1));
    }

    const normalize = (arr) => {
      if (orthoVec) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += arr[d] * orthoVec[d];
        for (let d = 0; d < dim; d++) arr[d] -= dot * orthoVec[d];
      }
      let norm = 0;
      for (let d = 0; d < dim; d++) norm += arr[d] * arr[d];
      norm = Math.sqrt(norm);
      if (norm < 1e-12) return false;
      for (let d = 0; d < dim; d++) arr[d] /= norm;
      return true;
    };

    if (!normalize(v)) return { axis: new Float64Array(dim), eigVal: 0 };

    const next = new Float64Array(dim);
    for (let iter = 0; iter < 45; iter++) {
      next.fill(0);
      for (let i = 0; i < n; i++) {
        const row = data[i];
        let proj = 0;
        for (let d = 0; d < dim; d++) proj += row[d] * v[d];
        for (let d = 0; d < dim; d++) next[d] += row[d] * proj;
      }
      for (let d = 0; d < dim; d++) v[d] = next[d];
      if (!normalize(v)) break;
    }

    // Deterministic sign convention: largest absolute entry positive
    let maxIdx = 0;
    for (let d = 1; d < dim; d++) {
      if (Math.abs(v[d]) > Math.abs(v[maxIdx])) maxIdx = d;
    }
    if (v[maxIdx] < 0) {
      for (let d = 0; d < dim; d++) v[d] = -v[d];
    }

    let eigVal = 0;
    for (let i = 0; i < n; i++) {
      const row = data[i];
      let proj = 0;
      for (let d = 0; d < dim; d++) proj += row[d] * v[d];
      eigVal += proj * proj;
    }

    return { axis: v, eigVal };
  }

  const pc1 = findPrincipalAxis(centered, null);
  const pc2 = findPrincipalAxis(centered, pc1.axis);

  const rawCoords = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = centered[i];
    let x = 0;
    let y = 0;
    for (let d = 0; d < dim; d++) {
      x += row[d] * pc1.axis[d];
      y += row[d] * pc2.axis[d];
    }
    rawCoords[i] = [x, y];
  }

  const var1 = Number(Math.min(100, (pc1.eigVal / totalVar) * 100).toFixed(1));
  const var2 = Number(Math.min(100 - var1, (pc2.eigVal / totalVar) * 100).toFixed(1));

  return {
    coords: normalizeCoords2D(rawCoords),
    varianceExplained: [var1, var2]
  };
}

function fitUmapAB(minDist) {
  // Fit 1 / (1 + a * d^(2b)) to smooth step exp(-(d - minDist)) via Gauss-Newton / grid search
  const xs = [];
  const ys = [];
  for (let i = 0; i <= 60; i++) {
    const x = (i / 60) * 3.0;
    xs.push(x);
    ys.push(x <= minDist ? 1.0 : Math.exp(-(x - minDist)));
  }

  let bestA = 1.577;
  let bestB = 0.895;
  let bestErr = Infinity;

  for (let b = 0.55; b <= 1.45; b += 0.05) {
    for (let a = 0.4; a <= 3.2; a += 0.08) {
      let err = 0;
      for (let i = 0; i < xs.length; i++) {
        const pred = 1.0 / (1.0 + a * Math.pow(xs[i] + 1e-6, 2 * b));
        const d = pred - ys[i];
        err += d * d;
      }
      if (err < bestErr) {
        bestErr = err;
        bestA = a;
        bestB = b;
      }
    }
  }
  return { a: bestA, b: bestB };
}

function buildKnnGraph(vectors, k, rng) {
  const n = vectors.length;
  const knnIndices = new Array(n);
  const knnDists = new Array(n);

  // Exact k-NN for N <= 1400, landmark-accelerated candidate pool for larger N
  const useLandmarks = n > 1400;
  let landmarks = null;
  let landmarkBuckets = null;

  if (useLandmarks) {
    const numLandmarks = Math.min(48, Math.floor(Math.sqrt(n)));
    landmarks = [];
    const step = Math.floor(n / numLandmarks);
    for (let l = 0; l < numLandmarks; l++) {
      landmarks.push(vectors[(l * step) % n]);
    }
    landmarkBuckets = Array.from({ length: numLandmarks }, () => []);
    for (let i = 0; i < n; i++) {
      let bestL = 0;
      let secondL = 0;
      let bestD = Infinity;
      let secondD = Infinity;
      for (let l = 0; l < numLandmarks; l++) {
        const d = squaredEuclidean(vectors[i], landmarks[l]);
        if (d < bestD) {
          secondD = bestD;
          secondL = bestL;
          bestD = d;
          bestL = l;
        } else if (d < secondD) {
          secondD = d;
          secondL = l;
        }
      }
      landmarkBuckets[bestL].push(i);
      if (secondL !== bestL) landmarkBuckets[secondL].push(i);
    }
  }

  for (let i = 0; i < n; i++) {
    const candidates = [];
    if (!useLandmarks) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        candidates.push({ idx: j, dist: Math.sqrt(squaredEuclidean(vectors[i], vectors[j])) });
      }
    } else {
      const seen = new Set([i]);
      // Find 2 nearest landmarks for i
      const lDists = landmarks.map((lm, lIdx) => ({ lIdx, d: squaredEuclidean(vectors[i], lm) }));
      lDists.sort((a, b) => a.d - b.d);
      for (let bIdx = 0; bIdx < Math.min(3, lDists.length); bIdx++) {
        for (const candIdx of landmarkBuckets[lDists[bIdx].lIdx]) {
          if (!seen.has(candIdx)) {
            seen.add(candIdx);
            candidates.push({ idx: candIdx, dist: Math.sqrt(squaredEuclidean(vectors[i], vectors[candIdx])) });
          }
        }
      }
      // Supplement with random samples so global links exist
      for (let r = 0; r < 24; r++) {
        const randIdx = Math.floor(rng() * n);
        if (!seen.has(randIdx)) {
          seen.add(randIdx);
          candidates.push({ idx: randIdx, dist: Math.sqrt(squaredEuclidean(vectors[i], vectors[randIdx])) });
        }
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const slice = candidates.slice(0, k);
    knnIndices[i] = slice.map((c) => c.idx);
    knnDists[i] = slice.map((c) => c.dist);
  }

  return { knnIndices, knnDists };
}

/**
 * Deterministic PCA-initialized 2D UMAP manifold projection.
 */
export function computeUMAP(vectors, options = {}) {
  const n = vectors.length;
  if (n === 0) return { coords: [] };
  if (n === 1) return { coords: [[0, 0]] };
  if (n === 2) return { coords: [[-0.6, 0], [0.6, 0]] };

  const rng = createSeededRng(options.seed ?? 1337);
  const k = Math.max(2, Math.min(options.nNeighbors ?? 15, n - 1));
  const minDist = Math.max(0.02, Math.min(0.95, options.minDist ?? 0.18));
  const epochs = options.epochs ?? (n > 800 ? 140 : 180);

  // 1. PCA initialization scaled to [-4, 4] for clean global structure
  const pcaInit = computePCA(vectors).coords;
  const embX = new Float64Array(n);
  const embY = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    embX[i] = pcaInit[i][0] * 4.0 + (rng() - 0.5) * 0.05;
    embY[i] = pcaInit[i][1] * 4.0 + (rng() - 0.5) * 0.05;
  }

  // 2. Build k-NN graph & compute smooth fuzzy simplicial set probabilities
  const { knnIndices, knnDists } = buildKnnGraph(vectors, k, rng);
  const target = Math.log2(k);
  const directedWeights = new Map();

  for (let i = 0; i < n; i++) {
    const dists = knnDists[i];
    const indices = knnIndices[i];
    const rho = dists.find((d) => d > 0) ?? 0;

    let lo = 1e-5;
    let hi = 100.0;
    let sigma = 1.0;

    for (let iter = 0; iter < 32; iter++) {
      sigma = (lo + hi) / 2;
      let pSum = 0;
      for (let m = 0; m < dists.length; m++) {
        const adj = Math.max(0, dists[m] - rho);
        pSum += adj === 0 ? 1.0 : Math.exp(-adj / sigma);
      }
      if (Math.abs(pSum - target) < 1e-4) break;
      if (pSum > target) hi = sigma;
      else lo = sigma;
    }

    for (let m = 0; m < dists.length; m++) {
      const j = indices[m];
      const adj = Math.max(0, dists[m] - rho);
      const p = adj === 0 ? 1.0 : Math.exp(-adj / sigma);
      if (p > 0.01) {
        directedWeights.set(`${i}:${j}`, p);
      }
    }
  }

  // 3. Symmetrize weights: w_ij = p_i|j + p_j|i - p_i|j * p_j|i
  const edges = [];
  const visitedPairs = new Set();

  for (const [key, pij] of directedWeights.entries()) {
    const sep = key.indexOf(':');
    const i = Number(key.slice(0, sep));
    const j = Number(key.slice(sep + 1));
    const canon = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (visitedPairs.has(canon)) continue;
    visitedPairs.add(canon);

    const pji = directedWeights.get(`${j}:${i}`) ?? 0;
    const sym = pij + pji - pij * pji;
    if (sym > 0.02) {
      edges.push({ u: i, v: j, w: sym });
      edges.push({ u: j, v: i, w: sym });
    }
  }

  if (edges.length === 0) {
    return { coords: pcaInit };
  }

  // 4. Epoch-scheduled SGD optimization
  const { a, b } = fitUmapAB(minDist);
  const maxW = edges.reduce((m, e) => (e.w > m ? e.w : m), 1e-6);
  const epochsPerSample = edges.map((e) => Math.max(1.0, maxW / e.w));
  const nextEpoch = epochsPerSample.map((eps) => eps);
  const negSampleRate = 5;

  for (let ep = 0; ep < epochs; ep++) {
    const alpha = 1.0 * (1.0 - ep / epochs);
    for (let eIdx = 0; eIdx < edges.length; eIdx++) {
      if (nextEpoch[eIdx] > ep) continue;
      nextEpoch[eIdx] += epochsPerSample[eIdx];

      const { u, v } = edges[eIdx];
      let dx = embX[u] - embX[v];
      let dy = embY[u] - embY[v];
      const distSq = dx * dx + dy * dy + 1e-4;
      const distPow = Math.pow(distSq, b);

      // Attractive gradient
      const gradCoeff = (-2.0 * a * b * Math.pow(distSq, b - 1.0)) / (1.0 + a * distPow);
      const gx = Math.max(-4, Math.min(4, gradCoeff * dx));
      const gy = Math.max(-4, Math.min(4, gradCoeff * dy));

      embX[u] += alpha * gx;
      embY[u] += alpha * gy;
      embX[v] -= alpha * gx;
      embY[v] -= alpha * gy;

      // Negative sampling repulsive steps
      for (let ns = 0; ns < negSampleRate; ns++) {
        const neg = Math.floor(rng() * n);
        if (neg === u) continue;

        const ndx = embX[u] - embX[neg];
        const ndy = embY[u] - embY[neg];
        const nDistSq = ndx * ndx + ndy * ndy + 1e-3;
        const repCoeff = (2.0 * b) / ((0.01 + nDistSq) * (1.0 + a * Math.pow(nDistSq, b)));
        const rgx = Math.max(-4, Math.min(4, repCoeff * ndx));
        const rgy = Math.max(-4, Math.min(4, repCoeff * ndy));

        embX[u] += alpha * rgx;
        embY[u] += alpha * rgy;
      }
    }
  }

  const finalCoords = new Array(n);
  for (let i = 0; i < n; i++) {
    finalCoords[i] = [embX[i], embY[i]];
  }
  return { coords: normalizeCoords2D(finalCoords) };
}

function runSingleKMeans(vectors, k, rng, maxIter = 35) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const centroids = [];

  // K-Means++ initialization
  const firstIdx = Math.floor(rng() * n);
  centroids.push(Float32Array.from(vectors[firstIdx]));

  const minDistSq = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let sumD = 0;
    const prevCentroid = centroids[c - 1];
    for (let i = 0; i < n; i++) {
      const d = squaredEuclidean(vectors[i], prevCentroid);
      if (d < minDistSq[i]) minDistSq[i] = d;
      sumD += minDistSq[i];
    }

    if (sumD <= 1e-12) {
      centroids.push(Float32Array.from(vectors[c % n]));
      continue;
    }

    let r = rng() * sumD;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= minDistSq[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push(Float32Array.from(vectors[chosen]));
  }

  const assignments = new Int32Array(n).fill(-1);
  let inertia = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    inertia = 0;

    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = squaredEuclidean(vectors[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      inertia += bestD;
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const v = vectors[i];
      const s = sums[c];
      for (let d = 0; d < dim; d++) s[d] += v[d];
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
  }

  return { assignments: Array.from(assignments), centroids, inertia };
}

function computeSilhouetteScore(vectors, assignments, k) {
  const n = vectors.length;
  if (k <= 1 || k >= n) return 0;

  // Subsample up to 240 points evenly so Auto-k remains instant even on large datasets
  const maxSample = 240;
  const step = Math.max(1, Math.floor(n / maxSample));
  const sampleIndices = [];
  for (let i = 0; i < n && sampleIndices.length < maxSample; i += step) {
    sampleIndices.push(i);
  }
  const m = sampleIndices.length;

  let totalSil = 0;
  for (let si = 0; si < m; si++) {
    const i = sampleIndices[si];
    const ci = assignments[i];

    const clusterSums = new Float64Array(k);
    const clusterCnts = new Int32Array(k);

    for (let sj = 0; sj < m; sj++) {
      if (si === sj) continue;
      const j = sampleIndices[sj];
      const cj = assignments[j];
      clusterSums[cj] += Math.sqrt(squaredEuclidean(vectors[i], vectors[j]));
      clusterCnts[cj]++;
    }

    const a = clusterCnts[ci] > 0 ? clusterSums[ci] / clusterCnts[ci] : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci || clusterCnts[c] === 0) continue;
      const meanOther = clusterSums[c] / clusterCnts[c];
      if (meanOther < b) b = meanOther;
    }
    if (!Number.isFinite(b)) b = 0;
    const denom = Math.max(a, b);
    totalSil += denom > 1e-9 ? (b - a) / denom : 0;
  }

  return totalSil / Math.max(1, m);
}

/**
 * Deterministic K-Means++ clustering with Auto-k Silhouette search & medoid landmark discovery.
 */
export function computeKMeans(vectors, options = {}) {
  const n = vectors.length;
  if (n === 0) {
    return { assignments: [], k: 0, centroids: [], medoidIndices: [], counts: [], silhouette: 0 };
  }
  if (n === 1) {
    return {
      assignments: [0],
      k: 1,
      centroids: [Float32Array.from(vectors[0])],
      medoidIndices: [0],
      counts: [1],
      silhouette: 1
    };
  }

  const rng = createSeededRng(options.seed ?? 2026);
  const maxK = Math.min(options.maxK ?? 8, n - 1);

  const fitBestRestart = (targetK) => {
    let best = null;
    for (let r = 0; r < 3; r++) {
      const candidate = runSingleKMeans(vectors, targetK, rng);
      if (!best || candidate.inertia < best.inertia) {
        best = candidate;
      }
    }
    return best;
  };

  let chosenK = options.k === 'auto' || !options.k ? 2 : Math.max(1, Math.min(Number(options.k), n));
  let bestRun = null;
  let bestSilhouette = -1;

  if (options.k === 'auto' || !options.k) {
    const upperK = Math.max(2, maxK);
    for (let candK = 2; candK <= upperK; candK++) {
      const run = fitBestRestart(candK);
      const sil = computeSilhouetteScore(vectors, run.assignments, candK);
      if (sil > bestSilhouette) {
        bestSilhouette = sil;
        chosenK = candK;
        bestRun = run;
      }
    }
  } else {
    bestRun = fitBestRestart(chosenK);
    bestSilhouette = computeSilhouetteScore(vectors, bestRun.assignments, chosenK);
  }

  const counts = new Array(chosenK).fill(0);
  const medoidIndices = new Array(chosenK).fill(0);
  const bestMedoidDist = new Array(chosenK).fill(Infinity);

  for (let i = 0; i < n; i++) {
    const c = bestRun.assignments[i];
    counts[c]++;
    const d = squaredEuclidean(vectors[i], bestRun.centroids[c]);
    if (d < bestMedoidDist[c]) {
      bestMedoidDist[c] = d;
      medoidIndices[c] = i;
    }
  }

  return {
    assignments: bestRun.assignments,
    k: chosenK,
    centroids: bestRun.centroids,
    medoidIndices,
    counts,
    silhouette: Number(bestSilhouette.toFixed(3))
  };
}
