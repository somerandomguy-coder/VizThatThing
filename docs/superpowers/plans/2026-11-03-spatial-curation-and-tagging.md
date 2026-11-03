# Spatial Curation, Cosine Retrieval, Downscaled Thumbnails & CSV Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive spatial curation (free-drag, Tidy reset, radius-aware right-click cosine similarity retrieval, marquee selection + local bin-packing), 256px downscaled canvas thumbnails with double-click Full-Res Lightbox, single-CSV tagging/grouping persistence, `Mount Local Folder` removal, and top-hook `README.md` presentation.

**Architecture:** Pure, unit-tested math/serialization modules (`src/analysis/similarity.js` and `src/curation/project-csv.js`) back an upgraded `DatasetHandler` (256px offscreen thumbnail cache + on-demand full-res Blob streaming + CSV project hydration) and desktop-grade `CanvasEngine` (left-drag marquee/move, right/middle-drag pan, stationary right-click cosine pull, double-click full-res lightbox). Canonical layouts remain immutable while `item.customPos` layers user arrangements cleanly on top with animated `Tidy` resets.

**Tech Stack:** Vanilla ES6 Modules, HTML5 2D Canvas, `OffscreenCanvas` / `ImageBitmap`, `jszip`, Vite, Node native test runner (`node --test`).

## Global Constraints

- Zero emojis in UI; keep editorial Light Mode default (`#f6f6f4` canvas, `#ffffff` surfaces, `1.5px` stroke SVGs) with Dark Mode parity.
- Zero bundled ML models; keep core bundle lightweight.
- Remove `Mount Local Folder` (`showDirectoryPicker`) completely.
- Canvas sprites must render from `<= 256px` downscaled thumbnails; full-resolution `Blob` URLs are created only on double-click Lightbox inspection and revoked immediately on close/navigation.

---

### Task 1: Cosine Similarity Retrieval & Local Subgroup Bin-Packing (`src/analysis/similarity.js`)

**Files:**
- Create: `src/analysis/similarity.js`
- Test: `tests/similarity.test.js`

**Interfaces:**
- Produces: `cosineSimilarity(a, b)`, `getActiveEmbedding(item, preferredSource)`, `findSimilarToAnchor(anchorItem, allItems, layoutLookup, options)`, `arrangePulledNeighbors(anchorBox, pulledItems, occupiedBoxes, thumbSize, gap)`, `packSelectedSubgroup(selectedLayoutItems, thumbSize, gap)`

- [ ] **Step 1: Write failing tests in `tests/similarity.test.js`** covering cosine similarity, radius-skipping (skipping top-5 items already inside `neighborRadius` so subsequent right-clicks pull the next 5), non-overlapping neighbor placement around an anchor, and local bin-packing of stacked items centered at selection centroid.
- [ ] **Step 2: Run `npm test` to confirm RED.**
- [ ] **Step 3: Implement `src/analysis/similarity.js`.**
- [ ] **Step 4: Run `npm test` to confirm GREEN.**

---

### Task 2: Single-CSV Curation, Tagging & Custom Position Persistence (`src/curation/project-csv.js` + `src/dataset-handler.js`)

**Files:**
- Create: `src/curation/project-csv.js`
- Modify: `src/dataset-handler.js`
- Test: `tests/project-csv.test.js`, `tests/dataset-handler.test.js`

**Interfaces:**
- Produces: `serializeProjectCSV(images)`, `applyCurationRecord(item, record)`, `summarizeCuration(images)`, `DatasetHandler.importExternalCSV(csvText)`, `DatasetHandler.getThumbnailDrawable(item, maxEdge = 256)`, `DatasetHandler.getFullResObjectUrl(item)`

- [ ] **Step 1: Write failing tests in `tests/project-csv.test.js` and `tests/dataset-handler.test.js`** covering CSV round-trip (`tags`, `group`, `cluster_override`, `custom_x`, `custom_y`, CSV quote escaping), auto-hydration when loading a ZIP/folder containing a project CSV, `importExternalCSV` on an already-loaded dataset, and verifying `loadDirectory` is removed.
- [ ] **Step 2: Run `npm test` to confirm RED.**
- [ ] **Step 3: Implement `src/curation/project-csv.js` and update `src/dataset-handler.js` (including 256px offscreen thumbnail generator & full-res URL helper + removing `loadDirectory`/`parseDirectory`).**
- [ ] **Step 4: Run `npm test` to confirm GREEN.**

---

### Task 3: Custom Position Overlay in Spatial Layouts (`src/packer.js`)

**Files:**
- Modify: `src/packer.js`
- Test: `tests/packer.test.js`

**Interfaces:**
- Produces: `applyCustomPositions(layout)` preserving `baseX`/`baseY` while applying `item.customPos = { x, y }` to `x, y, pointX, pointY` and expanding world bounds safely.

- [ ] **Step 1: Add failing test in `tests/packer.test.js` for `applyCustomPositions(layout)` and Tidy restoration.**
- [ ] **Step 2: Run `npm test` to confirm RED.**
- [ ] **Step 3: Implement `applyCustomPositions` in `src/packer.js`.**
- [ ] **Step 4: Run `npm test` to confirm GREEN.**

---

### Task 4: Interactive Desktop `CanvasEngine` (`src/canvas-engine.js`)

**Files:**
- Modify: `src/canvas-engine.js`

**Responsibilities:**
- Render `256px` downscaled `item.thumbDrawable` sprites (with fallback compatibility) and group/tag visual badges & `Color: Group / Tag` border/point encoding.
- Implement desktop pointer model:
  - Left-drag on empty space → marquee selection rectangle (`selectedPaths` Set) + `onSelectionChange`.
  - Left-drag on item → move single item or entire multi-selection (`item.customPos = { x, y }`).
  - Right-drag / Middle-drag / `Space + Left-drag` → pan viewport.
  - Stationary Right-click (`button === 2`, `dragMoved <= 4px`) on item → suppress contextmenu and fire `onItemRightClick(layoutItem)` to pull 5 similar images!
  - Double-click (`dblclick`) on item → fire `onItemDoubleClick(layoutItem)` to open Full-Res Lightbox!
- Smoothly animate programmatic position updates (`animateItemsToCustomPositions`).

---

### Task 5: Workbench UI, Selection Pill, Tagging, Full-Res Lightbox & README Hook (`index.html`, `src/style.css`, `src/ui/icons.js`, `src/dashboard.js`, `src/main.js`, `README.md`)

**Files:**
- Modify: `index.html`, `src/style.css`, `src/ui/icons.js`, `src/dashboard.js`, `src/main.js`, `README.md`

**Responsibilities:**
- Remove `Mount Local Folder` button; make `Select Folder` primary alongside `Open ZIP Archive` and `Import CSV`.
- Add top-bar **Tidy** button (`#btn-tidy-layout`), **Save CSV** button (`#btn-save-csv`), **Import CSV** action, and `Color: Group / Tag` option.
- Add page-size selector (`250` / `500` / `1000` / `All`) in pagination HUD + `pinnedPaths` set so off-page pulled similar images appear immediately on the active workspace.
- Add **Floating Selection Pill** (`#selection-bar`) with **Pack Selection**, **Tag / Group / Cluster** inline popover, **Pull 5 Similar**, and **Reset Position**.
- Add **Tags & Saved Groups** filter chips in `Explore` sidebar.
- Upgrade `#details-modal` to **Double-Click Full-Res Lightbox** with wheel zoom (`1×–8×`), drag-pan, `Fit` / `100%` toggle, inline Tag/Group/Cluster inputs, and immediate `URL.revokeObjectURL` on close/step.
- Restructure `README.md` so headline + pitch + tech stack + hero screenshot hook appear right at the top, capture updated screenshot(s), run `npm test` + `npm run build` + headless Chrome E2E verification, and commit & push if desired.
