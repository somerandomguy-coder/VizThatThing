# VizThatThing: Visual Analytics, Photography Diagnostics, Lazy Browser AI & Light-Mode Workbench Spec

**Date:** 2026-11-03  
**Status:** Approved

---

## 1. Goals & Core Principles

1. **Deep Dataset & Folder Analysis without Bloat**: Upgrade VizThatThing from a basic folder/prediction viewer into a client-side visual diagnostics workbench supporting **PCA**, **UMAP**, **K-Means++ Clustering**, **2D Color Maps**, **Theme Analysis**, and **Photography / Technical Quality Diagnostics** (resolution, aspect ratio, exposure/clipping, contrast, color temperature, sharpness/blur).
2. **Zero-Download Default, On-Demand Browser AI**: Keep initial load tiny (`jszip` + vanilla ES modules, zero ML runtimes bundled). Only download browser ML runtimes and weights (`@mediapipe/tasks-vision` for **Face Detection** & **Human Detection**, `@huggingface/transformers` CLIP for optional **Semantic Embeddings & Custom Zero-Shot Themes**) when the user explicitly clicks to activate them, with byte-level progress bars and persistent browser Cache API storage.
3. **Dual Scatter Render Modes**: In 2D spatial modes (`PCA`, `UMAP`, `Clusters`, `Color Map`), let users toggle seamlessly between:
   - **Image Thumbnails (`sprites`)**: Actual scaled images positioned in 2D space.
   - **Data Points + Landmarks (`points`)**: Crisp color-coded points across the *entire* filtered dataset (unbounded by pagination) with pinned landmark thumbnails at cluster medoids, rendering full image previews on hover.
4. **Anti-"AI Slop" Precision Light-Mode UI/UX**: Replace the neon-indigo glassmorphic dark UI, inline styles, emojis, and blocking `alert()`/`confirm()` dialogs with a clean, tactile **Light Mode** default (warm alabaster canvas `#f6f6f4`, `#ffffff` panels, `1px solid #e2e2df` hairlines, tabular monospace metrics, `1.5px` stroke SVG icons, zero emojis, plus an optional clean dark room toggle).

---

## 2. System Architecture & File Decomposition

```
src/
├── main.js                      # Lean app orchestrator, state store, event wiring
├── dataset-handler.js           # ZIP, FileSystem Access API, FileList, YOLO/CSV/JSON metadata parser
├── packer.js                    # Spatial layout solvers: BinPack, Justified, PCA, UMAP, Cluster Islands, 2D Color Map
├── canvas-engine.js             # High-DPI zoom/pan canvas, animated transitions, Sprites vs Points+Landmarks, bbox overlays
├── analysis/
│   ├── image-metrics.js         # Pure pixel/photo feature extractor (64-dim vector, palette, RGB/luma hist, exposure, sharpness, themes)
│   ├── projections.js           # Pure math: StandardScaler, 2D PCA, PCA-initialized UMAP, K-Means++ (with auto-k silhouette)
│   ├── analysis-worker.js       # Web Worker running OffscreenCanvas feature extraction + PCA/UMAP/K-Means off main thread
│   └── analysis-controller.js   # Main-thread coordinator managing Worker jobs, caching, and dataset aggregations
├── ml/
│   └── model-manager.js         # Lazy CDN loader + Cache API byte progress for BlazeFace, EfficientDet Person, and CLIP
└── ui/
    ├── icons.js                 # Crisp 1.5px stroke inline SVG icon registry (zero emojis)
    ├── toast.js                 # Non-blocking toast & background task progress notifications
    ├── charts.js                # Interactive HiDPI histograms, brushable range bars, palette swatches, RGB inspector curve
    └── styles.css               # Complete Light-Mode-first design system (with clean [data-theme="dark"] support)
```

---

## 3. Feature Specifications

### 3.1 Lightweight Visual & Photography Feature Pass (`image-metrics.js`)
Computed per image from downscaled pixel buffers (`64×64` RGBA for sharpness/histograms/colors) in the Web Worker (with main-thread chunked fallback if `OffscreenCanvas` is unavailable):
- **64-Dimensional Visual Embedding Vector**:
  - 24-bin HSL color histogram (hue × saturation/lightness)
  - 27-dim `3×3` spatial average RGB grid (captures spatial composition, e.g., sky/horizon/center subject)
  - 8-bin Sobel edge orientation & magnitude histogram
  - 5 normalized global scalars: mean luminance, RMS contrast, mean saturation, warm/cool color temperature index, log aspect ratio
- **Dominant Color Palette**: Fast 5-swatch K-means color quantization per image (`#hex` + percentage) + primary HSL coordinates `(hue, sat, lum)` for 2D Color Map positioning, aggregated into a clickable dataset-wide color spectrum bar.
- **Photography & Quality Metrics**:
  - **Resolution Tier**: ` Tiny (<0.5 MP)`, `SD (0.5–1 MP)`, `HD (1–2 MP)`, `FHD (2–8 MP)`, `4K+ (>8 MP)`
  - **Aspect Ratio Bucket**: `Portrait (<0.85)`, `Square (0.85–1.15)`, `Standard 4:3 (1.15–1.5)`, `Wide 16:9 (>1.5)`
  - **Lighting & Exposure**:
    - 32-bin RGB & Luminance histograms per image
    - Shadow clipping ratio (`% pixels with Y < 12`) & Highlight clipping ratio (`% pixels with Y > 243`)
    - Exposure status: `Underexposed` (mean Y < 65 or shadow clip > 35%), `Overexposed` (mean Y > 205 or highlight clip > 30%), `Low Contrast` (std Y < 28), or `Balanced`
    - Color Temperature score (`-1.0` Cool Blue ↔ `+1.0` Warm Amber)
  - **Focus / Sharpness Score**: Discrete `3×3` Laplacian variance normalized to `0–100` (`Blurry < 15`, `Soft 15–35`, `Sharp > 35`).
- **Heuristic Visual Themes**: Multi-label tags assigned automatically: `Warm`, `Cool`, `High-Key`, `Low-Key`, `Vibrant`, `Monochrome`, `High-Contrast`, `Soft/Muted`, `Detailed`.

### 3.2 Dimensionality Reduction & Clustering (`projections.js`)
- **PCA**: Mean-centered, unit-variance standardized covariance power-iteration extracting top 2 orthogonal principal components `(pc1, pc2)` plus `[var1%, var2%]` explained variance ratios.
- **UMAP**: Deterministic PCA-initialized 2D UMAP using $k$-nearest neighbors cosine/Euclidean graph, smooth local connectivity ($\rho_i, \sigma_i$), symmetrized fuzzy simplicial set weights, and SGD attractive/repulsive optimization (with landmark approximation when $N > 1500$ for sub-second speed). Configurable `nNeighbors` (`5–50`) and `minDist` (`0.05–0.8`).
- **Clustering**: K-Means++ with deterministic seeded initialization, supporting explicit $k \in [2, 16]$ or **Auto $k$** (evaluates $k \in [2, 8]$ via silhouette score). Produces `clusterId`, cluster size, dominant cluster color/theme summary, and **medoid image** (closest item to cluster centroid, used as pinned landmark in Point Cloud mode).

### 3.3 Spatial Canvas Modes & Dual Render Toggle (`packer.js` & `canvas-engine.js`)
- **6 Layout Modes**:
  1. `pack` — 2D Growing Bin Packer
  2. `grid` — Justified Row Grid
  3. `pca` — 2D PCA Projection Plane (with subtle axis crosshair & variance labels)
  4. `umap` — 2D UMAP Manifold Cloud (with optional overlap relaxation toggle)
  5. `clusters` — Grouped Cluster Islands (each cluster packed into its own titled island with medoid header & count badge)
  6. `colormap` — 2D Hue × Luminance (or Temp × Exposure) Color Map
- **Scatter Render Toggle (`Thumbnails` vs. `Data Points`)**:
  - In `pca`, `umap`, `clusters`, and `colormap`:
    - `sprites` mode renders image thumbnails with smooth `320ms` cubic-out position transitions when switching modes.
    - `points` mode renders all filtered dataset items at once as anti-aliased circles (`4–8px`) colored by `Cluster`, `Folder/Class`, `Dominant Color`, `Exposure`, or `Prediction Status`, plus crisp framed **landmark thumbnails** at each cluster medoid. Hovering any dot highlights it and displays its thumbnail + metadata immediately in the floating hover card.
- **Canvas Overlays**:
  - Bounding-box rendering on thumbnails (and inside the full-res modal) for detected **Faces** (cobalt `#2563eb`) and **Humans** (amber `#d97706`), plus optional YOLO `.txt` annotation boxes if present in the dataset!

### 3.4 On-Demand Browser AI Lab (`model-manager.js`)
- **Strict Lazy Loading**: Zero network requests until user clicks a model's **Load & Scan** button.
- **Byte-Level Download Progress + Persistent Cache**: Uses `fetch()` streaming + `caches.open('vizthatthing-ml-v1')` for `.tflite` weights so download size, percentage, and `"Cached Locally"` state are transparent, with a `"Clear Model Cache"` button.
  1. **Face Detection** (`~230 KB` BlazeFace Short-Range via `@mediapipe/tasks-vision`): Populates `item.ai.faces = [{ bbox, score }]`, unlocks `Faces Detected`, `No Faces`, and `Multi-Face (2+)` filters + bbox overlay.
  2. **Human Detection** (`~4.6 MB` EfficientDet-Lite0 `person` class via `@mediapipe/tasks-vision`): Populates `item.ai.humans = [{ bbox, score }]`, unlocks `Humans Detected` / `Person Count` filters + bbox overlay.
  3. **Semantic CLIP Embeddings & Custom Themes** (`~45 MB` quantized `Xenova/clip-vit-base-patch32` via `@huggingface/transformers`): Computes 512-dim normalized vision embeddings so PCA/UMAP/Clustering can switch from *Visual Appearance* to *Semantic Meaning*, and lets users type custom comma-separated theme labels (e.g., `"portrait, landscape, architecture, night, blurry"`) for zero-shot theme classification.

### 3.5 Workbench UI/UX (`index.html` & `ui/styles.css`)
- **Top Header (`48px`)**: Brand mark, dataset summary pill, `Open` dropdown (Mount Folder / Upload Folder / Upload ZIP / Demo), segmented Spatial Mode bar (`Pack`, `Grid`, `PCA`, `UMAP`, `Clusters`, `Color Map`), contextual `Sprites | Points` & `Color By` controls, `Split View`, `Link`, and `Light/Dark` toggle.
- **Left Rail (`310px`, Collapsible, 4 Clean Tabs)**:
  1. **Explore**: Folder hierarchy with `A`/`B` quick-assign pills, text search, classification metrics & confidence range filter, YOLO/Mock prediction helper.
  2. **Analysis**: Feature extraction progress/status, Embedding source (`Visual Fast` vs `CLIP Semantic`), Cluster count ($k$ / Auto) & interactive cluster legend, Dataset Color Spectrum swatches, and Visual Theme filter bars.
  3. **Photo**: Resolution tier pills, Aspect Ratio pills, Exposure status chips (`Under`, `Balanced`, `Over`, `Flat`), interactive Sharpness (Blur ↔ Sharp) & Brightness histograms/sliders.
  4. **AI Models**: On-demand cards for **Face Detection**, **Human Detection**, and **CLIP Semantic Themes**, with exact file size badges, progress bars, scan scope (`Active Folder` vs `Entire Dataset`), bbox overlay toggles, and detection count filters.
- **Floating Hover Card & Fullscreen Inspector Modal**:
  - Hover card includes instant thumbnail preview (essential for Point Cloud mode!), resolution, sharpness/exposure pills, cluster badge, and metadata.
  - Inspector modal supports `←`/`→` arrow key navigation, `Esc` to close, live RGB/Luminance curve, 5-swatch copyable hex palette, photography diagnostics table, and interactive Face/Human bounding box toggle.

---

## 4. Verification Strategy
- **Automated Unit Tests (`node --test tests/*.test.js`)**:
  - `tests/projections.test.js`: Verify PCA variance & orthogonality, UMAP 2D cluster separation & determinism, K-Means++ convergence & Auto-$k$ silhouette selection.
  - `tests/image-metrics.test.js`: Verify synthetic RGBA buffers for solid colors, warm vs cool temperature, dark/clipped vs bright/blown exposure, checkerboard sharp vs flat blurry Laplacian scores, and 64-dim vector finiteness.
  - `tests/packer.test.js`: Verify `packLayout`, `justifyLayout`, `scatterLayout`, `clusterIslandsLayout`, and `colorMapLayout` coordinate bounds.
- **Build & End-to-End Verification**:
  - `npm run build` clean output check (confirming zero bundled ML weights in `dist/`).
  - Headless/browser verification loading `demo_dataset.zip` and `manhole cover 1.yolov8.zip` to confirm UI rendering, spatial mode transitions, Point Cloud vs Thumbnail mode, Photo filters, and AI model lazy-loading UX.
