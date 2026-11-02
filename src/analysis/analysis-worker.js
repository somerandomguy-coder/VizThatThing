import { analyzeRgbaBuffer } from './image-metrics.js';
import { computePCA, computeUMAP, computeKMeans } from './projections.js';

const SAMPLE_SIZE = 64;
let offscreen = null;
let offCtx = null;

function ensureCanvas() {
  if (!offscreen && typeof OffscreenCanvas !== 'undefined') {
    offscreen = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    offCtx = offscreen.getContext('2d', { willReadFrequently: true });
  }
  return offCtx;
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'analyze-batch') {
    const { jobId, batch } = msg;
    const ctx = ensureCanvas();
    if (!ctx) {
      self.postMessage({ type: 'error', jobId, error: 'OffscreenCanvas unavailable' });
      return;
    }

    const results = [];
    for (const entry of batch) {
      try {
        const bmp = await createImageBitmap(entry.blob);
        const origW = bmp.width || 200;
        const origH = bmp.height || 200;

        ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        ctx.drawImage(bmp, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        bmp.close();

        const imgData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const analysis = analyzeRgbaBuffer(imgData.data, SAMPLE_SIZE, SAMPLE_SIZE, origW, origH);

        results.push({
          index: entry.index,
          width: origW,
          height: origH,
          analysis
        });
      } catch (err) {
        results.push({
          index: entry.index,
          width: 200,
          height: 200,
          error: err?.message || 'Decode failed',
          analysis: null
        });
      }
    }

    self.postMessage({ type: 'batch-result', jobId, results });
  } else if (msg.type === 'compute-projections') {
    const { jobId, vectors, options } = msg;
    try {
      const pca = computePCA(vectors);
      const umap = computeUMAP(vectors, {
        nNeighbors: options?.nNeighbors ?? 15,
        minDist: options?.minDist ?? 0.18,
        epochs: options?.epochs
      });
      const kmeans = computeKMeans(vectors, {
        k: options?.k ?? 'auto',
        maxK: options?.maxK ?? 8
      });

      self.postMessage({
        type: 'projections-result',
        jobId,
        pca,
        umap,
        kmeans
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        jobId,
        error: err?.message || 'Projection computation failed'
      });
    }
  }
};

