# Spatial Curation, Cosine Retrieval, Downscaled Thumbnails & CSV Tagging Design

**Date:** 2026-11-03  
**Project:** VizThatThing (`c:\Users\Nam\Projects\Deploying\SWE\vizthatthing`)

## 1. Goals & Scope

Transform VizThatThing from a read-only spatial viewer into an **interactive visual curation & similarity workbench** while lowering memory pressure on high-resolution folders:

1. **README Top-Hook Layout**: Lead `README.md` with the title, value pitch, and tech stack strip followed immediately by the hero workbench screenshot and visual preview gallery.
2. **256px Downscaled Canvas Thumbnails + Page Cap Selector**: Decode downscaled thumbnails (`max 256px` longest edge) for canvas sprites and release raw `Blob` URLs immediately. Keep default pagination at `500/page` with an inline selector (`250`, `500`, `1000`, `All`) while keeping 100% of the uploaded dataset indexed for cosine similarity and analytics. Remove the `Mount Local Folder` (`showDirectoryPicker`) feature completely.
3. **Free-Drag Spatial Canvas, "Tidy" Button & Radius-Aware Cosine Similarity Pull**:
   - Layer mutable `item.customPos = { x, y }` coordinates over canonical layouts (`Pack`, `Grid`, `PCA`, `UMAP`, `Clusters`, `Color Map`), with a top-bar **Tidy** button that smoothly resets items back to canonical coordinates.
   - **Desktop Pointer Mapping**:
     - **Left-drag on empty space**: Draws a marquee selection box (`Shift` adds/toggles).
     - **Left-drag on an image**: Moves that image (or moves all selected images together when dragging a selected item).
     - **Right-drag or Middle-drag** (plus `Space + Left-drag`): Pans the viewport.
     - **Stationary Right-click on an image** (`dragMoved <= 4px`): Instantly pulls the **5 most similar images** (cosine similarity on 512-d CLIP embedding if available, else 64-d visual feature vector), skipping any candidate already positioned within proximity radius $R$ of the anchor so repeated right-clicks pull the *next* 5, then the *next* 5, arranging them cleanly around the anchor.
4. **Marquee Selection & Local Bin-Packing**:
   - Selecting `1+` stacked images surfaces a compact **Floating Selection Pill** (`N selected · Pack Selection · Tag / Group · Hard Cluster · Pull 5 Similar · Reset Position`).
   - **Pack Selection** runs 2D `packLayout` locally on the selected items centered at their bounding-box midpoint so zero items overlap.
5. **Double-Click In-App Full-Resolution Lightbox**:
   - **Double-clicking** any image opens the upgraded Lightbox Modal, streaming the **un-downscaled original `Blob`** on demand with 1:1 mouse-wheel zoom & pan (`Fit` / `100%`), `←`/`→` navigation, inline Tag/Group/Cluster editing, and immediate `URL.revokeObjectURL` cleanup when closed or stepped.
6. **Tagging, Grouping, Hard Cluster Overrides & Single-CSV Project Save/Load**:
   - Curation metadata per image: `tags: string[]`, `group: string`, `manualCluster: string`, and `customPos: { x, y } | null`.
   - Export via header **Save CSV** (`<dataset>_vizproject.csv`) and auto-restore on folder/ZIP load (or standalone CSV import) by matching `full_path` first, then `filename`.
   - Filter by **Groups & Tags** in the `Explore` sidebar and color items by `Group / Tag` in the top `Color:` selector.

---

## 2. Module Boundaries & Interfaces

### 2.1 `src/analysis/similarity.js` (New Pure Module)
- `cosineSimilarity(vecA, vecB)`: Safe L2-normalized dot product returning `[-1, 1]`.
- `getActiveEmbedding(item, preferredSource)`: Returns `item.ai?.embedding` when `preferredSource === 'clip'` (or available) else `item.analysis?.featureVector`.
- `findSimilarToAnchor(anchorItem, allItems, layoutLookup, options)`:
  - Ranks `allItems` (excluding `anchorItem`) by descending cosine similarity.
  - Checks `layoutLookup.get(candidate.fullPath)` center distance against `anchorCenter`: if distance `<= neighborRadius`, skips candidate as *already sitting nearby*.
  - Returns top `count` (default `5`) candidates with `{ item, similarity }`.
- `arrangePulledNeighbors(anchorBox, pulledItems, existingBoxes, thumbSize, gap)`:
  - Computes non-overlapping target `{ x, y, w, h }` slots radiating around `anchorBox` (avoiding `anchorBox` and existing nearby boxes so successive right-clicks place rings 1, 2, 3 cleanly without stacking).
- `packSelectedSubgroup(selectedLayoutItems, thumbSize, gap)`:
  - Runs `packLayout` on `selectedLayoutItems` and centers the resulting non-overlapping block at the centroid of `selectedLayoutItems`.

### 2.2 `src/curation/project-csv.js` (New Pure Module)
- `serializeProjectCSV(images)`: Produces RFC-4180 CSV with columns `filename,full_path,label,prediction,confidence,tags,group,cluster_override,custom_x,custom_y`.
- `applyCurationRecord(item, rawRecord)`: Hydrates `item.curation = { tags, group, manualCluster }` and `item.customPos = { x, y } | null` from parsed CSV/JSON metadata rows (`tags` semicolon- or pipe-delimited, `group`, `cluster_override`, `custom_x`, `custom_y`).
- `summarizeCuration(images)`: Aggregates tag counts, group counts, manual cluster overrides, and custom-positioned count for sidebar filtering & UI state.

### 2.3 `src/dataset-handler.js` (Modified)
- Remove `dirHandle`, `loadDirectory`, and `parseDirectory` (`Mount Local Folder` removal).
- Automatically invoke `applyCurationRecord` during `createImageItem` and add `importExternalCSV(text)` so users can also drop/load a saved `.csv` onto an already-open folder.
- Add `getThumbnailDrawable(imageItem, maxEdge = 256)`: Decodes the original `Blob` once into an offscreen `<canvas>` / `ImageBitmap` capped at `256px` max edge (recording true `naturalWidth`/`naturalHeight` on `imageItem.width`/`height` if not yet set), revokes any temporary `Blob` URL immediately, and caches lightweight `imageItem.thumbDrawable`.
- Add `getFullResObjectUrl(imageItem)`: Creates a fresh full-resolution `URL.createObjectURL(blob)` exclusively for the Double-Click Full-Res Lightbox (caller revokes on close/navigation).

### 2.4 `src/canvas-engine.js` (Modified)
- **Desktop Pointer Controller**:
  - Left-down on item → select item (unless already in multi-selection; `Shift` toggles) and drag item(s), updating `item.customPos = { x, y }` on all selected items (`onCustomPositionsChange`).
  - Left-down on empty space → draw marquee selection rectangle (`marqueeRect`), live-highlighting intersecting items and firing `onSelectionChange(selectedItems, boundsScreenRect)`.
  - Right-down (`button === 2`) or Middle-down (`button === 1`) or `Space + Left-down` → pan viewport. If right-up occurs with `dragMoved <= 4px` over an item, suppress native context menu and fire `onItemRightClick(layoutItem)`.
  - Double-click (`dblclick`) over an item → fire `onItemDoubleClick(layoutItem)` to open Full-Res Lightbox.
- **Rendering Additions**:
  - Draw `item.thumbDrawable` (`256px` downscaled sprite).
  - Draw crisp cobalt selection outlines + subtle selection badge/marquee overlay + tag/group pill indicator when zoomed in, plus `Color: Group / Tag` support.
  - Smoothly animate programmatic moves (`packSelectedSubgroup`, `arrangePulledNeighbors`, and `Tidy` reset) via existing `320ms` cubic transition loop.

### 2.5 `index.html`, `src/style.css`, `src/main.js`, `src/dashboard.js` (Modified)
- Remove `Mount Local Folder` button from landing card; promote `Upload Folder` (`Select Folder`) to primary CTA alongside `Open ZIP Archive` and `Import Project CSV`.
- Add top-bar **Tidy** button (`#btn-tidy-layout`) and **Save CSV** button (`#btn-save-csv`), plus `Color: Group / Tag` option in `#select-color-by`.
- Add page-size selector (`#select-page-size`: `250`, `500`, `1000`, `All`) inside the bottom pagination HUD, plus `pinnedPaths` support so off-page images pulled via right-click cosine similarity appear immediately on the active workspace.
- Add **Floating Selection Pill** (`#selection-action-bar`) with **Pack Selection**, **Tag / Group** popover, **Pull 5 Similar**, and **Reset Pos**.
- Add **Tags & Groups** filter section in `Explore` tab.
- Upgrade `#details-modal` to a **Full-Res Lightbox** (`dblclick` trigger) with mouse-wheel zoom (`1×`–`8×`), drag-pan, `Fit` / `1:1 (100%)` button, inline Tag/Group/Cluster editor, and strict full-res `Blob` URL revocation on close/step.

