import { analyzeRgbaBuffer, aggregateDatasetAnalytics } from './image-metrics.js';
import { computePCA, computeUMAP, computeKMeans } from './projections.js';
import { getClusterColor } from '../packer.js';

export class AnalysisController {
  constructor() {
    this.worker = null;
    this.jobSeq = 0;
    this.pendingJobs = new Map();
    this.activeRunToken = 0;
    this.summary = null;
    this.projectionMeta = {
      source: 'visual', // 'visual' | 'clip'
      varianceExplained: [0, 0],
      k: 0,
      silhouette: 0,
      clusters: []
    };
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return null;
    }
    try {
      this.worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const { jobId, type, ...payload } = e.data || {};
        const pending = this.pendingJobs.get(jobId);
        if (!pending) return;
        this.pendingJobs.delete(jobId);
        if (type === 'error') {
          pending.reject(new Error(payload.error || 'Worker error'));
        } else {
          pending.resolve(payload);
        }
      };
      this.worker.onerror = (err) => {
        for (const [, p] of this.pendingJobs) p.reject(err);
        this.pendingJobs.clear();
      };
      return this.worker;
    } catch {
      return null;
    }
  }

  postWorkerJob(type, data) {
    const worker = this.ensureWorker();
    if (!worker) return Promise.reject(new Error('Worker unavailable'));
    const jobId = ++this.jobSeq;
    return new Promise((resolve, reject) => {
      this.pendingJobs.set(jobId, { resolve, reject });
      worker.postMessage({ type, jobId, ...data });
    });
  }

  cancelActive() {
    this.activeRunToken++;
  }

  async extractMainThreadFallback(item, datasetHandler) {
    const sampleSize = 64;
    const url = await datasetHandler.getBlobUrl(item);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const origW = img.naturalWidth || 200;
        const origH = img.naturalHeight || 200;
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const rgba = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
        resolve({
          width: origW,
          height: origH,
          analysis: analyzeRgbaBuffer(rgba, sampleSize, sampleSize, origW, origH)
        });
      };
      img.onerror = () => resolve({ width: 200, height: 200, analysis: null });
      img.src = url;
    });
  }

  /**
   * Extracts pixel/photo features for all images in batches, then computes PCA, UMAP, and K-Means++.
   */
  async analyzeDataset(images, datasetHandler, options = {}, onProgress = () => { }) {
    const runToken = ++this.activeRunToken;
    const total = images.length;
    if (total === 0) {
      this.summary = aggregateDatasetAnalytics([]);
      return { summary: this.summary, projectionMeta: this.projectionMeta };
    }

    const batchSize = 24;
    let processed = 0;
    const useWorker = Boolean(this.ensureWorker());

    for (let start = 0; start < total; start += batchSize) {
      if (runToken !== this.activeRunToken) return null;

      const slice = [];
      for (let i = start; i < Math.min(total, start + batchSize); i++) {
        if (!images[i].analysis) {
          slice.push({ index: i, item: images[i] });
        } else {
          processed++;
        }
      }

      if (slice.length > 0) {
        if (useWorker) {
          try {
            const batchPayload = await Promise.all(
              slice.map(async ({ index, item }) => ({
                index,
                blob: await datasetHandler.getBlob(item)
              }))
            );
            const { results } = await this.postWorkerJob('analyze-batch', { batch: batchPayload });
            for (const r of results) {
              const target = images[r.index];
              if (!target) continue;
              if (!target.dimensionsLoaded && r.width && r.height) {
                target.width = r.width;
                target.height = r.height;
                target.dimensionsLoaded = true;
              }
              if (r.analysis) {
                target.analysis = r.analysis;
              }
            }
          } catch {
            // Fallback to main thread if worker decode failed
            for (const { item } of slice) {
              const res = await this.extractMainThreadFallback(item, datasetHandler);
              if (!item.dimensionsLoaded) {
                item.width = res.width;
                item.height = res.height;
                item.dimensionsLoaded = true;
              }
              item.analysis = res.analysis;
            }
          }
        } else {
          for (const { item } of slice) {
            const res = await this.extractMainThreadFallback(item, datasetHandler);
            if (!item.dimensionsLoaded) {
              item.width = res.width;
              item.height = res.height;
              item.dimensionsLoaded = true;
            }
            item.analysis = res.analysis;
          }
        }
        processed += slice.length;
      }

      onProgress({
        stage: 'features',
        completed: Math.min(total, processed),
        total,
        percent: Math.round((Math.min(total, processed) / total) * 78),
        message: `Extracting visual & photo metrics (${Math.min(total, processed)}/${total})`
      });
    }

    if (runToken !== this.activeRunToken) return null;

    this.summary = aggregateDatasetAnalytics(images);

    onProgress({
      stage: 'projections',
      completed: total,
      total,
      percent: 85,
      message: 'Computing PCA, UMAP manifold & K-Means++ clusters...'
    });

    await this.recomputeProjections(images, options);

    if (runToken !== this.activeRunToken) return null;

    onProgress({
      stage: 'done',
      completed: total,
      total,
      percent: 100,
      message: 'Analysis complete'
    });

    return {
      summary: this.summary,
      projectionMeta: this.projectionMeta
    };
  }

  /**
   * Re-runs PCA, UMAP, and K-Means++ on either the 64-dim visual vectors or 512-dim CLIP embeddings.
   */
  async recomputeProjections(images, options = {}) {
    const wantClip = options.source === 'clip';
    const validEntries = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const vec = wantClip && img.ai?.embedding ? img.ai.embedding : img.analysis?.vector;
      if (vec) {
        validEntries.push({ img, vec });
      }
    }

    if (validEntries.length === 0) return this.projectionMeta;

    const actualSource =
      wantClip && validEntries.every((e) => e.img.ai?.embedding) ? 'clip' : 'visual';
    const vectors = validEntries.map((e) => e.vec);

    let pca;
    let umap;
    let kmeans;

    if (this.ensureWorker()) {
      try {
        const res = await this.postWorkerJob('compute-projections', {
          vectors,
          options: {
            k: options.k ?? 'auto',
            maxK: options.maxK ?? 8,
            nNeighbors: options.nNeighbors ?? 15,
            minDist: options.minDist ?? 0.18
          }
        });
        pca = res.pca;
        umap = res.umap;
        kmeans = res.kmeans;
      } catch {
        pca = computePCA(vectors);
        umap = computeUMAP(vectors, options);
        kmeans = computeKMeans(vectors, options);
      }
    } else {
      pca = computePCA(vectors);
      umap = computeUMAP(vectors, options);
      kmeans = computeKMeans(vectors, options);
    }

    const medoidSet = new Set(kmeans.medoidIndices);

    validEntries.forEach(({ img }, idx) => {
      img.pca = pca.coords[idx] || [0, 0];
      img.umap = umap.coords[idx] || [0, 0];
      img.clusterId = kmeans.assignments[idx] ?? 0;
      img.isMedoid = medoidSet.has(idx);
    });

    // Build readable cluster summaries
    const clusters = [];
    for (let cid = 0; cid < kmeans.k; cid++) {
      const members = validEntries.filter((_, idx) => kmeans.assignments[idx] === cid).map((e) => e.img);
      const themeFreq = {};
      for (const m of members) {
        const tags = (actualSource === 'clip' && m.ai?.clipThemes) || m.analysis?.themes || [];
        for (const t of tags) themeFreq[t] = (themeFreq[t] || 0) + 1;
      }
      const topTheme = Object.entries(themeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const medoidIdx = kmeans.medoidIndices[cid] ?? 0;

      clusters.push({
        id: cid,
        label: topTheme ? `Cluster ${cid + 1} · ${topTheme}` : `Cluster ${cid + 1}`,
        shortLabel: `C${cid + 1}`,
        theme: topTheme,
        count: members.length,
        color: getClusterColor(cid),
        medoid: validEntries[medoidIdx]?.img || members[0] || null
      });
    }

    this.projectionMeta = {
      source: actualSource,
      varianceExplained: pca.varianceExplained,
      k: kmeans.k,
      silhouette: kmeans.silhouette,
      clusters
    };

    return this.projectionMeta;
  }
}

