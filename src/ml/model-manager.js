// Strictly lazy-loaded Browser AI Model Manager (0 bytes downloaded until requested)

const CACHE_NAME = 'vizthatthing-ml-v1';

const MEDIAPIPE_ESM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';
const MEDIAPIPE_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

export const MODEL_SPECS = {
  face: {
    id: 'face',
    name: 'BlazeFace Detector',
    sizeLabel: '~230 KB',
    approxBytes: 229746,
    assetUrl:
      'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
  },
  human: {
    id: 'human',
    name: 'EfficientDet Person Detector',
    sizeLabel: '~4.6 MB',
    approxBytes: 4602795,
    assetUrl:
      'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'
  },
  clip: {
    id: 'clip',
    name: 'CLIP ViT-B/32 (Quantized)',
    sizeLabel: '~85 MB',
    modelId: 'Xenova/clip-vit-base-patch32',
    esmUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js'
  }
};

export const DEFAULT_CLIP_THEMES = [
  'portrait or person',
  'street or urban scene',
  'nature or landscape',
  'indoor room or object',
  'vehicle or machinery',
  'text or document',
  'animal or wildlife',
  'night or dark scene'
];

export class ModelManager {
  constructor() {
    this.mediapipeModule = null;
    this.visionFileset = null;
    this.faceDetector = null;
    this.humanDetector = null;

    this.transformersModule = null;
    this.clipBundle = null;

    this.cachedStatus = {
      face: false,
      human: false,
      clip: false
    };

    this.activeAbort = null;
  }

  cancelRunningScan() {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
  }

  async checkCachedModels() {
    if (typeof caches === 'undefined') return this.cachedStatus;
    try {
      const cache = await caches.open(CACHE_NAME);
      const faceHit = await cache.match(MODEL_SPECS.face.assetUrl);
      const humanHit = await cache.match(MODEL_SPECS.human.assetUrl);
      this.cachedStatus.face = Boolean(faceHit);
      this.cachedStatus.human = Boolean(humanHit);

      const hasTfCache = await caches.has('transformers-cache');
      if (hasTfCache) {
        const tfCache = await caches.open('transformers-cache');
        const keys = await tfCache.keys();
        this.cachedStatus.clip = keys.some((req) => req.url.includes('clip-vit-base-patch32'));
      }
    } catch {
      // Ignore storage permission restrictions in incognito
    }
    return { ...this.cachedStatus };
  }

  async clearModelCache() {
    this.faceDetector = null;
    this.humanDetector = null;
    this.clipBundle = null;
    this.cachedStatus = { face: false, human: false, clip: false };

    if (typeof caches !== 'undefined') {
      await caches.delete(CACHE_NAME);
      await caches.delete('transformers-cache');
    }
  }

  async fetchAssetWithProgress(url, fallbackTotalBytes, onProgress) {
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url);
        if (cached) {
          const buf = await cached.arrayBuffer();
          onProgress?.({ stage: 'cached', percent: 100, loadedBytes: buf.byteLength, totalBytes: buf.byteLength });
          return new Uint8Array(buf);
        }
      } catch {
        // Proceed to network fetch
      }
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download model (${res.status})`);
    }

    const totalBytes = Number(res.headers.get('content-length')) || fallbackTotalBytes || 0;
    if (!res.body) {
      const buf = await res.arrayBuffer();
      await this.tryPutCache(url, buf);
      return new Uint8Array(buf);
    }

    const reader = res.body.getReader();
    const chunks = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loadedBytes += value.byteLength;
      const pct = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 50;
      onProgress?.({ stage: 'downloading', percent: pct, loadedBytes, totalBytes });
    }

    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    await this.tryPutCache(url, merged.buffer);
    onProgress?.({ stage: 'downloaded', percent: 100, loadedBytes, totalBytes: loadedBytes });
    return merged;
  }

  async tryPutCache(url, arrayBuffer) {
    if (typeof caches === 'undefined') return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        url,
        new Response(arrayBuffer, {
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      );
    } catch {
      // Ignore quota errors
    }
  }

  async ensureMediaPipe(onProgress) {
    if (!this.mediapipeModule) {
      onProgress?.({ stage: 'runtime', percent: 5, message: 'Loading MediaPipe WASM runtime...' });
      this.mediapipeModule = await import(/* @vite-ignore */ MEDIAPIPE_ESM_URL);
    }
    if (!this.visionFileset) {
      this.visionFileset = await this.mediapipeModule.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
    }
    return { mp: this.mediapipeModule, vision: this.visionFileset };
  }

  async ensureFaceDetector(onProgress) {
    if (this.faceDetector) return this.faceDetector;
    const { mp, vision } = await this.ensureMediaPipe(onProgress);
    const modelBytes = await this.fetchAssetWithProgress(
      MODEL_SPECS.face.assetUrl,
      MODEL_SPECS.face.approxBytes,
      ({ percent, loadedBytes, totalBytes }) => {
        const kb = Math.round(loadedBytes / 1024);
        const totKb = Math.round((totalBytes || MODEL_SPECS.face.approxBytes) / 1024);
        onProgress?.({
          stage: 'downloading',
          percent,
          message: `Downloading BlazeFace (${kb} / ${totKb} KB)`
        });
      }
    );
    this.cachedStatus.face = true;
    this.faceDetector = await mp.FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: modelBytes },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.45
    });
    return this.faceDetector;
  }

  async ensureHumanDetector(onProgress) {
    if (this.humanDetector) return this.humanDetector;
    const { mp, vision } = await this.ensureMediaPipe(onProgress);
    const modelBytes = await this.fetchAssetWithProgress(
      MODEL_SPECS.human.assetUrl,
      MODEL_SPECS.human.approxBytes,
      ({ percent, loadedBytes, totalBytes }) => {
        const mb = (loadedBytes / (1024 * 1024)).toFixed(1);
        const totMb = ((totalBytes || MODEL_SPECS.human.approxBytes) / (1024 * 1024)).toFixed(1);
        onProgress?.({
          stage: 'downloading',
          percent,
          message: `Downloading Person Detector (${mb} / ${totMb} MB)`
        });
      }
    );
    this.cachedStatus.human = true;
    this.humanDetector = await mp.ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: modelBytes },
      runningMode: 'IMAGE',
      scoreThreshold: 0.38,
      categoryAllowlist: ['person']
    });
    return this.humanDetector;
  }

  async decodeForInference(item, datasetHandler, maxSide = 640) {
    const blob = await datasetHandler.getBlob(item);
    const bmp = await createImageBitmap(blob);
    const origW = bmp.width || 1;
    const origH = bmp.height || 1;

    if (!item.dimensionsLoaded) {
      item.width = origW;
      item.height = origH;
      item.dimensionsLoaded = true;
    }

    const scale = Math.min(1, maxSide / Math.max(origW, origH));
    const w = Math.max(16, Math.round(origW * scale));
    const h = Math.max(16, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();

    return { canvas, width: w, height: h };
  }

  async runFaceDetection(images, datasetHandler, onProgress) {
    this.cancelRunningScan();
    const abort = new AbortController();
    this.activeAbort = abort;

    const detector = await this.ensureFaceDetector(onProgress);
    let detectedImages = 0;
    let totalFaces = 0;

    for (let i = 0; i < images.length; i++) {
      if (abort.signal.aborted) break;
      const item = images[i];

      if (!item.ai.faces) {
        try {
          const { canvas, width, height } = await this.decodeForInference(item, datasetHandler, 640);
          const result = detector.detect(canvas);
          const faces = (result?.detections || []).map((det) => {
            const bb = det.boundingBox;
            const score = det.categories?.[0]?.score ?? 0.5;
            return {
              type: 'face',
              label: 'Face',
              score: Number(score.toFixed(3)),
              bbox: [
                Math.max(0, bb.originX / width),
                Math.max(0, bb.originY / height),
                Math.min(1, bb.width / width),
                Math.min(1, bb.height / height)
              ]
            };
          });
          item.ai.faces = faces;
        } catch {
          item.ai.faces = [];
        }
      }

      if (item.ai.faces.length > 0) {
        detectedImages++;
        totalFaces += item.ai.faces.length;
      }

      if (i % 4 === 0 || i === images.length - 1) {
        onProgress?.({
          stage: 'scanning',
          completed: i + 1,
          total: images.length,
          percent: Math.round(((i + 1) / Math.max(1, images.length)) * 100),
          message: `Scanning faces (${i + 1}/${images.length}) · ${totalFaces} found`
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    return { detectedImages, totalFaces };
  }

  async runHumanDetection(images, datasetHandler, onProgress) {
    this.cancelRunningScan();
    const abort = new AbortController();
    this.activeAbort = abort;

    const detector = await this.ensureHumanDetector(onProgress);
    let detectedImages = 0;
    let totalHumans = 0;

    for (let i = 0; i < images.length; i++) {
      if (abort.signal.aborted) break;
      const item = images[i];

      if (!item.ai.humans) {
        try {
          const { canvas, width, height } = await this.decodeForInference(item, datasetHandler, 640);
          const result = detector.detect(canvas);
          const humans = (result?.detections || []).map((det) => {
            const bb = det.boundingBox;
            const score = det.categories?.[0]?.score ?? 0.5;
            return {
              type: 'human',
              label: 'Person',
              score: Number(score.toFixed(3)),
              bbox: [
                Math.max(0, bb.originX / width),
                Math.max(0, bb.originY / height),
                Math.min(1, bb.width / width),
                Math.min(1, bb.height / height)
              ]
            };
          });
          item.ai.humans = humans;
        } catch {
          item.ai.humans = [];
        }
      }

      if (item.ai.humans.length > 0) {
        detectedImages++;
        totalHumans += item.ai.humans.length;
      }

      if (i % 3 === 0 || i === images.length - 1) {
        onProgress?.({
          stage: 'scanning',
          completed: i + 1,
          total: images.length,
          percent: Math.round(((i + 1) / Math.max(1, images.length)) * 100),
          message: `Scanning humans (${i + 1}/${images.length}) · ${totalHumans} found`
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    return { detectedImages, totalHumans };
  }

  async ensureClipModel(onProgress) {
    if (this.clipBundle) return this.clipBundle;

    if (!this.transformersModule) {
      onProgress?.({ stage: 'runtime', percent: 3, message: 'Loading Transformers.js runtime...' });
      this.transformersModule = await import(/* @vite-ignore */ MODEL_SPECS.clip.esmUrl);
      if (this.transformersModule.env) {
        this.transformersModule.env.allowLocalModels = false;
      }
    }

    const {
      AutoProcessor,
      CLIPVisionModelWithProjection,
      AutoTokenizer,
      CLIPTextModelWithProjection,
      RawImage
    } = this.transformersModule;

    const progressCb = (info) => {
      if (info.status === 'progress' && typeof info.progress === 'number') {
        const fileShort = (info.file || '').split('/').pop();
        onProgress?.({
          stage: 'downloading',
          percent: Math.round(info.progress),
          message: `Downloading CLIP ${fileShort} (${Math.round(info.progress)}%)`
        });
      }
    };

    const modelId = MODEL_SPECS.clip.modelId;
    const [processor, visionModel, tokenizer, textModel] = await Promise.all([
      AutoProcessor.from_pretrained(modelId, { progress_callback: progressCb }),
      CLIPVisionModelWithProjection.from_pretrained(modelId, { progress_callback: progressCb }),
      AutoTokenizer.from_pretrained(modelId, { progress_callback: progressCb }),
      CLIPTextModelWithProjection.from_pretrained(modelId, { progress_callback: progressCb })
    ]);

    this.cachedStatus.clip = true;
    this.clipBundle = { processor, visionModel, tokenizer, textModel, RawImage };
    return this.clipBundle;
  }

  async runClipSemanticAnalysis(images, datasetHandler, customThemesInput, onProgress) {
    this.cancelRunningScan();
    const abort = new AbortController();
    this.activeAbort = abort;

    const { processor, visionModel, tokenizer, textModel, RawImage } = await this.ensureClipModel(onProgress);

    const themes = (
      Array.isArray(customThemesInput) && customThemesInput.length > 0
        ? customThemesInput
        : DEFAULT_CLIP_THEMES
    )
      .map((t) => t.trim())
      .filter(Boolean);

    // Precompute normalized text embeddings for zero-shot theme tagging
    onProgress?.({ stage: 'text', percent: 5, message: 'Encoding zero-shot theme prompts...' });
    const prompts = themes.map((t) => `a photo of ${t}`);
    const textInputs = tokenizer(prompts, { padding: true, truncation: true });
    const { text_embeds } = await textModel(textInputs);
    const dim = text_embeds.dims[1];
    const textVectors = themes.map((_, idx) => {
      const slice = Float32Array.from(text_embeds.data.slice(idx * dim, (idx + 1) * dim));
      let norm = 0;
      for (let d = 0; d < dim; d++) norm += slice[d] * slice[d];
      norm = Math.sqrt(norm) || 1;
      for (let d = 0; d < dim; d++) slice[d] /= norm;
      return slice;
    });

    for (let i = 0; i < images.length; i++) {
      if (abort.signal.aborted) break;
      const item = images[i];

      try {
        if (!item.ai.embedding) {
          const blob = await datasetHandler.getBlob(item);
          const rawImg = await RawImage.fromBlob(blob);
          const imageInputs = await processor(rawImg);
          const { image_embeds } = await visionModel(imageInputs);
          const vec = Float32Array.from(image_embeds.data.slice(0, dim));
          let norm = 0;
          for (let d = 0; d < dim; d++) norm += vec[d] * vec[d];
          norm = Math.sqrt(norm) || 1;
          for (let d = 0; d < dim; d++) vec[d] /= norm;
          item.ai.embedding = vec;
        }

        // Score against current themes
        const scores = textVectors.map((tv, tIdx) => {
          let dot = 0;
          for (let d = 0; d < dim; d++) dot += item.ai.embedding[d] * tv[d];
          return { theme: themes[tIdx], score: dot };
        });
        scores.sort((a, b) => b.score - a.score);
        item.ai.clipThemes = [scores[0].theme];
        item.ai.clipTopScore = Number(scores[0].score.toFixed(3));
      } catch (e) {
        console.warn(`CLIP failed on ${item.name}`, e);
      }

      onProgress?.({
        stage: 'scanning',
        completed: i + 1,
        total: images.length,
        percent: Math.round(((i + 1) / Math.max(1, images.length)) * 100),
        message: `Embedding images with CLIP (${i + 1}/${images.length})`
      });
      await new Promise((r) => setTimeout(r, 0));
    }

    return { themes };
  }
}
