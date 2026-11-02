# VizThatThing Visual Analytics, Photography Diagnostics & Light-Mode Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade VizThatThing into a lightweight, client-side visual analytics & photography diagnostics workbench with instant PCA/UMAP/Clustering/Color-Map/Theme/Photo analysis, dual Thumbnail vs. Point-Cloud spatial rendering, lazy-loaded browser Face/Human/CLIP AI models, and a crisp Light-Mode UI.

**Architecture:** Pure pixel & photography metrics (`64×64` RGBA analysis) plus PCA, PCA-initialized UMAP, and K-Means++ run inside a dedicated Web Worker (`src/analysis/analysis-worker.js`) with zero external ML dependencies bundled. Optional Face Detection, Human Detection (`@mediapipe/tasks-vision`), and CLIP Semantic Embeddings (`@huggingface/transformers`) load strictly on demand from CDN with Cache API persistence and byte-level progress bars. The UI is rebuilt around a clean Light-Mode CSS variable system, SVG icon registry, 4-tab collapsible sidebar, and enhanced dual-mode `CanvasEngine`.

**Tech Stack:** Vanilla ES6 Modules, HTML5 2D Canvas + OffscreenCanvas, Web Workers, Vite 8, `jszip`, Node 24 native test runner (`node --test`), lazy CDN `@mediapipe/tasks-vision@0.10.18` & `@huggingface/transformers@3.3.3`.

## Global Constraints

- Zero ML models or runtimes bundled in initial `npm run build` output (`jszip` remains the sole runtime npm dependency).
- Default theme MUST be crisp Light Mode (`#f6f6f4` canvas, `#ffffff` surfaces, `1px solid #e2e2df` borders, zero emojis, `1.5px` stroke inline SVG icons), with an optional `[data-theme="dark"]` toggle.
- No blocking `window.alert()` or `window.confirm()` calls anywhere in the application.
- Every pure math, pixel metric, and spatial layout module MUST follow TDD (`node --test`) before integration.

---

### Task 1: Pure Photography & Visual Feature Extractor (`src/analysis/image-metrics.js`)

**Files:**
- Modify: `package.json` (add `"test": "node --test tests/*.test.js"`)
- Create: `src/analysis/image-metrics.js`
- Test: `tests/image-metrics.test.js`

**Interfaces:**
- Produces:
  - `analyzeRgbaBuffer(rgba, width, height, origWidth, origHeight)` → `{ vector: Float32Array(64), dominantHex: string, palette: Array<{hex, ratio, h, s, l}>, primaryHsl: {h, s, l}, histograms: { r: number[32], g: number[32], b: number[32], luma: number[32] }, photo: { megapixels, resolutionTier, aspectBucket, brightness, contrast, saturation, temperature, shadowClip, highlightClip, exposureStatus, sharpness, sharpnessLabel }, themes: string[] }`
  - `aggregateDatasetAnalytics(items)` → `{ paletteSummary, themeCounts, resolutionCounts, aspectCounts, exposureCounts, sharpnessValues, brightnessValues }`

- [ ] **Step 1: Add `"test"` script to `package.json` and write failing `tests/image-metrics.test.js`**
- [ ] **Step 2: Run `npm test` to verify RED state**
- [ ] **Step 3: Implement `src/analysis/image-metrics.js` (64-dim HSL+spatial+Sobel+stats vector, 5-swatch palette, Laplacian sharpness, exposure/clipping, color temp, heuristic themes, dataset aggregator)**
- [ ] **Step 4: Run `npm test` to verify GREEN state**

---

### Task 2: Dimensionality Reduction & Clustering Engine (`src/analysis/projections.js`)

**Files:**
- Create: `src/analysis/projections.js`
- Test: `tests/projections.test.js`

**Interfaces:**
- Produces:
  - `computePCA(vectors)` → `{ coords: Array<[number, number]>, varianceExplained: [number, number] }` (normalized to `[-1, 1]`)
  - `computeUMAP(vectors, options = { nNeighbors: 15, minDist: 0.18, epochs: 180 })` → `{ coords: Array<[number, number]> }` (PCA-initialized, normalized to `[-1, 1]`)
  - `computeKMeans(vectors, options = { k: 'auto', maxK: 8 })` → `{ assignments: number[], k: number, centroids: Float32Array[], medoidIndices: number[], counts: number[], silhouette: number }`

- [ ] **Step 1: Write failing tests in `tests/projections.test.js` covering PCA variance/separation, UMAP manifold preservation & small-N edge cases ($N=1, 2, 30$), and K-Means++ Auto-$k$ + medoid selection**
- [ ] **Step 2: Run `npm test` to verify RED state**
- [ ] **Step 3: Implement `src/analysis/projections.js`**
- [ ] **Step 4: Run `npm test` to verify GREEN state**

---

### Task 3: Spatial Layout Solvers for Scatter, Cluster Islands & Color Map (`src/packer.js`)

**Files:**
- Modify: `src/packer.js`
- Test: `tests/packer.test.js`

**Interfaces:**
- Produces:
  - `packLayout(items, baseSize, gap)` (existing + preserved)
  - `justifyLayout(items, containerWidth, targetRowHeight, gap)` (existing + preserved)
  - `scatterLayout(items, coordKey, worldSize, thumbSize, relaxOverlaps)` → `{ items, width, height, axes, landmarks }` (`coordKey`: `'pca'` | `'umap'`)
  - `clusterIslandsLayout(items, baseSize, gap)` → `{ items, width, height, islands: Array<{ clusterId, x, y, w, h, count, label, color, medoidItem }> }`
  - `colorMapLayout(items, worldSize, thumbSize, axesMode)` → `{ items, width, height, axes }` (`axesMode`: `'hue-lum'` | `'temp-exp'`)

- [ ] **Step 1: Write failing tests in `tests/packer.test.js` for all 5 layout engines**
- [ ] **Step 2: Run `npm test` to verify RED state**
- [ ] **Step 3: Implement new spatial solvers in `src/packer.js`**
- [ ] **Step 4: Run `npm test` to verify GREEN state**

---

### Task 4: Web Worker Analysis Pipeline & On-Demand Browser AI Manager

**Files:**
- Create: `src/analysis/analysis-worker.js`
- Create: `src/analysis/analysis-controller.js`
- Create: `src/ml/model-manager.js`
- Modify: `src/dataset-handler.js` (also support YOLO `.txt` bounding box annotations alongside CSV/JSON metadata!)

**Interfaces:**
- `AnalysisController`:
  - `analyzeDataset(images, datasetHandler, onProgress)` → extracts `item.analysis` (`vector`, `palette`, `photo`, `themes`, `histograms`) in batches via Worker (`OffscreenCanvas` or main-thread `64×64` canvas fallback), then runs PCA, UMAP, and K-Means++ off-thread.
  - `recomputeProjections(images, { source, k, nNeighbors, minDist, relaxOverlaps })` → updates `item.pca`, `item.umap`, `item.clusterId`, `clusterSummary`.
- `ModelManager`:
  - `getStatus(modelKey)` / `checkCachedModels()` / `clearModelCache()`
  - `runFaceDetection(images, datasetHandler, onProgress)` → loads `@mediapipe/tasks-vision` + cached `blaze_face_short_range.tflite`, populates `item.ai.faces`.
  - `runHumanDetection(images, datasetHandler, onProgress)` → loads `@mediapipe/tasks-vision` + cached `efficientdet_lite0.tflite` (`person`), populates `item.ai.humans`.
  - `runClipSemanticAnalysis(images, datasetHandler, customThemes, onProgress)` → loads `@huggingface/transformers` (`Xenova/clip-vit-base-patch32`), populates `item.ai.embedding` + `item.ai.clipThemes`.

- [ ] **Step 1: Upgrade `src/dataset-handler.js` with YOLO label parsing (`labels/*.txt` + `data.yaml` class names!) + fast `getImageBitmapOrElement(item)` helper + unit test in `tests/dataset-handler.test.js`**
- [ ] **Step 2: Implement `src/analysis/analysis-worker.js` and `src/analysis/analysis-controller.js`**
- [ ] **Step 3: Implement `src/ml/model-manager.js` with `ReadableStream` byte progress & `Cache` API storage**
- [ ] **Step 4: Run `npm test` to confirm all unit tests remain green**

---

### Task 5: Upgraded Dual-Mode `CanvasEngine` (`Sprites` vs `Points + Landmarks`, Animated Transitions, Overlays)

**Files:**
- Modify: `src/canvas-engine.js`

**Interfaces:**
- Supports `renderStyle`: `'sprites'` | `'points'`
- Supports `colorBy`: `'none'` | `'cluster'` | `'prediction'` | `'dominant'` | `'exposure'` | `'sharpness'`
- Supports `overlays`: `{ bboxes: boolean, labels: boolean }`
- Smooth `320ms` cubic-ease layout transitions when switching spatial modes on the same items
- Draws coordinate axes/gridlines in `pca` / `umap` / `colormap`, cluster island cards/headers in `clusters`, pinned landmark medoid thumbnails in `points` mode, and crisp Face / Human / Ground-Truth bounding boxes on images

- [ ] **Step 1: Upgrade `src/canvas-engine.js` with Light/Dark theme awareness, smooth layout animation, Point Cloud + Landmark renderer, spatial axis/island chrome, and bounding-box overlays**
- [ ] **Step 2: Verify click vs. drag disambiguation (so panning never accidentally opens the modal!)**

---

### Task 6: Crisp Light-Mode UI System, SVG Icons, Interactive Charts & Main Orchestrator

**Files:**
- Create: `src/ui/icons.js`
- Create: `src/ui/toast.js`
- Create: `src/ui/charts.js`
- Replace: `src/style.css` & `index.html`
- Replace: `src/main.js` & `src/dashboard.js`
- Update: `generate_demo.js` (generate rich varied synthetic images with gradients, shapes, sharp edges, blurry samples, bright/dark exposures so demo dataset showcases every single analytics & photo feature!)

- [ ] **Step 1: Build `src/ui/icons.js` (clean 1.5px stroke SVGs), `src/ui/toast.js` (toasts + non-blocking task progress bar), and `src/ui/charts.js` (interactive brushable histograms, RGB/Luminance curve, clickable palette & theme bars)**
- [ ] **Step 2: Rebuild `index.html` and `src/style.css` with the Light-Mode workbench design (`#f6f6f4` alabaster canvas, `#ffffff` rail, 4 tabs: `Explore`, `Analysis`, `Photo`, `AI Models`, upgraded Inspector Modal with keyboard navigation & bbox toggle, zero inline styles, zero emojis)**
- [ ] **Step 3: Implement clean `src/main.js` & `src/dashboard.js` wiring all spatial modes, `Sprites | Points` toggle, `Color By`, cluster/color/theme/photo/AI filters, split-view sync, and instant "Load Built-in Sample Dataset" button right on the empty state!**

---

### Task 7: Verification, Screenshots, README Overhaul & Push to GitHub

**Files:**
- Modify: `README.md`
- Update screenshots in `public/screenshots/` if needed

- [ ] **Step 1: Run `npm test` and `npm run build`, verifying 0 test failures and tiny initial bundle size**
- [ ] **Step 2: Start dev server and verify real dataset flows (`demo_dataset.zip` and `manhole cover 1.yolov8.zip` — note the user literally has a YOLOv8 zip right in the folder! Supporting YOLO `.txt` + `data.yaml` out of the box will make that dataset shine!)**
- [ ] **Step 3: Rewrite `README.md` cleanly to document all new analytics (PCA, UMAP, K-Means Clustering, Color Map, Theme Analysis, Photography & Quality Diagnostics, On-Demand Face/Human/CLIP AI, Dual Render Modes, Light/Dark Workbench)**
- [ ] **Step 4: Stage, commit cleanly, verify `git status` & `git diff`, and `git push origin main`**
