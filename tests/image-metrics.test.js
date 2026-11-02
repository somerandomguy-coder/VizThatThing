import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRgbaBuffer, aggregateDatasetAnalytics } from '../src/analysis/image-metrics.js';

function makeSolidRgba(w, h, r, g, b, a = 255) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

function makeCheckerboardRgba(w, h, low = 15, high = 240) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 === 0 ? high : low;
      const idx = (y * w + x) * 4;
      buf[idx] = v;
      buf[idx + 1] = v;
      buf[idx + 2] = v;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

function makeSmoothGradientRgba(w, h) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const t = x / Math.max(1, w - 1);
      const u = y / Math.max(1, h - 1);
      buf[idx] = Math.round(40 + t * 170);
      buf[idx + 1] = Math.round(50 + u * 150);
      buf[idx + 2] = Math.round(80 + (1 - t) * 120);
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

test('analyzeRgbaBuffer produces finite 64-dim vector and RGB/luma histograms', () => {
  const rgba = makeSmoothGradientRgba(32, 32);
  const res = analyzeRgbaBuffer(rgba, 32, 32, 1920, 1080);

  assert.equal(res.vector.length, 64);
  for (const val of res.vector) {
    assert.ok(Number.isFinite(val), `Expected finite vector entry, got ${val}`);
  }
  assert.equal(res.histograms.r.length, 32);
  assert.equal(res.histograms.g.length, 32);
  assert.equal(res.histograms.b.length, 32);
  assert.equal(res.histograms.luma.length, 32);
  assert.equal(res.photo.resolutionTier, 'FHD');
  assert.equal(res.photo.aspectBucket, 'Wide');
});

test('analyzeRgbaBuffer distinguishes warm vibrant vs cool monochrome themes and temperature', () => {
  const warmBuf = makeSolidRgba(32, 32, 235, 95, 25);
  const coolGrayBuf = makeSolidRgba(32, 32, 120, 122, 126);

  const warm = analyzeRgbaBuffer(warmBuf, 32, 32, 800, 800);
  const gray = analyzeRgbaBuffer(coolGrayBuf, 32, 32, 800, 800);

  assert.ok(warm.photo.temperature > 0.25, `Expected positive warm temperature, got ${warm.photo.temperature}`);
  assert.ok(warm.themes.includes('Warm'));
  assert.ok(warm.themes.includes('Vibrant'));
  assert.equal(warm.photo.aspectBucket, 'Square');
  assert.equal(warm.photo.resolutionTier, 'SD');

  assert.ok(gray.themes.includes('Monochrome'));
  assert.equal(gray.photo.exposureStatus, 'Low Contrast');
});

test('analyzeRgbaBuffer flags underexposed shadow clipping and overexposed highlight clipping', () => {
  const darkBuf = makeSolidRgba(32, 32, 4, 5, 6);
  const blownBuf = makeSolidRgba(32, 32, 252, 253, 250);

  const dark = analyzeRgbaBuffer(darkBuf, 32, 32, 400, 600);
  const blown = analyzeRgbaBuffer(blownBuf, 32, 32, 4000, 3000);

  assert.equal(dark.photo.exposureStatus, 'Underexposed');
  assert.ok(dark.photo.shadowClip > 0.9);
  assert.ok(dark.themes.includes('Low-Key'));
  assert.equal(dark.photo.aspectBucket, 'Portrait');
  assert.equal(dark.photo.resolutionTier, 'Tiny');

  assert.equal(blown.photo.exposureStatus, 'Overexposed');
  assert.ok(blown.photo.highlightClip > 0.9);
  assert.ok(blown.themes.includes('High-Key'));
  assert.equal(blown.photo.resolutionTier, '4K+');
  assert.equal(blown.photo.aspectBucket, 'Standard');
});

test('analyzeRgbaBuffer measures higher Laplacian sharpness on checkerboard than smooth buffer', () => {
  const sharpBuf = makeCheckerboardRgba(32, 32, 15, 240);
  const blurryBuf = makeSolidRgba(32, 32, 128, 128, 128);

  const sharp = analyzeRgbaBuffer(sharpBuf, 32, 32, 1280, 960);
  const blurry = analyzeRgbaBuffer(blurryBuf, 32, 32, 1280, 960);

  assert.ok(sharp.photo.sharpness > 60, `Expected high sharpness, got ${sharp.photo.sharpness}`);
  assert.equal(sharp.photo.sharpnessLabel, 'Sharp');
  assert.equal(blurry.photo.sharpness, 0);
  assert.equal(blurry.photo.sharpnessLabel, 'Blurry');
});

test('aggregateDatasetAnalytics summarizes themes, exposure, resolution, and palette buckets', () => {
  const a = analyzeRgbaBuffer(makeSolidRgba(16, 16, 230, 60, 40), 16, 16, 1920, 1080);
  const b = analyzeRgbaBuffer(makeSolidRgba(16, 16, 30, 110, 230), 16, 16, 500, 500);
  const summary = aggregateDatasetAnalytics([{ analysis: a }, { analysis: b }]);

  assert.equal(summary.analyzedCount, 2);
  assert.equal(summary.resolutionCounts.FHD, 1);
  assert.equal(summary.resolutionCounts.Tiny, 1);
  assert.ok(summary.themeCounts.Warm >= 1);
  assert.ok(summary.themeCounts.Cool >= 1);
  assert.ok(summary.paletteSummary.length > 0);
});
