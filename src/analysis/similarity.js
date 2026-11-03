import { packLayout } from '../packer.js';

/**
 * Computes L2-normalized cosine similarity in [-1, 1].
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 1e-12 || normB <= 1e-12) return 0;
  return dot / Math.sqrt(normA * normB);
}

function isVectorLike(vec) {
  return Boolean(vec && (Array.isArray(vec) || ArrayBuffer.isView(vec)) && vec.length > 0);
}

/**
 * Resolves the active embedding vector for an image item.
 * Supports both `analysis.vector` (Float32Array from analyzeRgbaBuffer) and `ai.embedding` (CLIP).
 */
export function getActiveEmbedding(item, preferredSource = 'visual') {
  if (!item) return null;
  if (preferredSource === 'clip' && isVectorLike(item.ai?.embedding)) {
    return item.ai.embedding;
  }
  if (isVectorLike(item.analysis?.vector)) {
    return item.analysis.vector;
  }
  if (isVectorLike(item.analysis?.featureVector)) {
    return item.analysis.featureVector;
  }
  if (isVectorLike(item.ai?.embedding)) {
    return item.ai.embedding;
  }
  return null;
}

function getBoxCenter(box) {
  if (box.pointX !== undefined && box.pointY !== undefined && (!box.w || !box.h)) {
    return { cx: box.pointX, cy: box.pointY };
  }
  return {
    cx: (box.curX ?? box.x ?? 0) + (box.curW ?? box.w ?? 0) / 2,
    cy: (box.curY ?? box.y ?? 0) + (box.curH ?? box.h ?? 0) / 2
  };
}

/**
 * Finds the top `count` most cosine-similar images to `anchorItem`, skipping any candidates
 * already positioned within `neighborRadius` of `anchorItem` on the canvas so repeated
 * right-clicks pull successive rings of neighbors.
 */
export function findSimilarToAnchor(anchorItem, allItems, layoutLookup, options = {}) {
  const count = options.count ?? 5;
  const preferredSource = options.embeddingSource ?? 'visual';
  const neighborRadius = options.neighborRadius ?? 420;

  const anchorVec = getActiveEmbedding(anchorItem, preferredSource);
  if (!anchorVec || !Array.isArray(allItems) || allItems.length <= 1) {
    return [];
  }

  const anchorBox = layoutLookup?.get(anchorItem.fullPath) || null;
  const anchorCenter = anchorBox ? getBoxCenter(anchorBox) : null;
  const radiusSq = neighborRadius * neighborRadius;

  const scored = [];
  for (const candidate of allItems) {
    if (!candidate || candidate === anchorItem || candidate.fullPath === anchorItem.fullPath) {
      continue;
    }

    if (anchorCenter && layoutLookup?.has(candidate.fullPath)) {
      const cBox = layoutLookup.get(candidate.fullPath);
      const { cx, cy } = getBoxCenter(cBox);
      const dx = cx - anchorCenter.cx;
      const dy = cy - anchorCenter.cy;
      if (dx * dx + dy * dy <= radiusSq) {
        continue; // Already sitting next to the anchor!
      }
    }

    const candVec = getActiveEmbedding(candidate, preferredSource);
    if (!candVec || candVec.length !== anchorVec.length) continue;

    const similarity = cosineSimilarity(anchorVec, candVec);
    scored.push({ item: candidate, similarity });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, count);
}

function computeThumbSize(item, baseSize) {
  const iw = item.width > 0 ? item.width : 200;
  const ih = item.height > 0 ? item.height : 200;
  const aspect = iw / ih;
  const snap = (v) => Math.max(12, Math.round(v / 4) * 4);
  if (iw >= ih) {
    return { w: snap(baseSize), h: snap(baseSize / aspect) };
  }
  return { w: snap(baseSize * aspect), h: snap(baseSize) };
}

function rectsCollideWithMargin(a, b, margin) {
  return (
    a.x < b.x + b.w + margin &&
    a.x + a.w + margin > b.x &&
    a.y < b.y + b.h + margin &&
    a.y + a.h + margin > b.y
  );
}

/**
 * Generates clean non-overlapping `{ item, x, y, w, h }` target boxes radiating around `anchorBox`
 * while avoiding `occupiedBoxes` so successive right-clicks expand outward cleanly.
 */
export function arrangePulledNeighbors(anchorBox, pulledItems, occupiedBoxes = [], thumbSize = 180, gap = 8) {
  if (!pulledItems || pulledItems.length === 0) return [];

  const acx = anchorBox.x + anchorBox.w / 2;
  const acy = anchorBox.y + anchorBox.h / 2;
  const stepX = Math.max(anchorBox.w, thumbSize) + gap * 1.5;
  const stepY = Math.max(anchorBox.h, thumbSize) + gap * 1.5;

  // Build spiral/ring grid slot offsets around (0, 0), starting to the right then clockwise
  const candidateOffsets = [];
  for (let ring = 1; ring <= 8; ring++) {
    // Right edge (top to bottom)
    for (let ry = -ring + 1; ry <= ring; ry++) candidateOffsets.push([ring, ry]);
    // Bottom edge (right-1 to -ring)
    for (let rx = ring - 1; rx >= -ring; rx--) candidateOffsets.push([rx, ring]);
    // Left edge (ring-1 to -ring)
    for (let ry = ring - 1; ry >= -ring; ry--) candidateOffsets.push([-ring, ry]);
    // Top edge (-ring+1 to ring)
    for (let rx = -ring + 1; rx <= ring; rx++) candidateOffsets.push([rx, -ring]);
  }

  // Prefer slots closest to anchor center (biased slightly right so first pull fans right/around)
  candidateOffsets.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1] - (a[0] > 0 ? 0.15 : 0);
    const db = b[0] * b[0] + b[1] * b[1] - (b[0] > 0 ? 0.15 : 0);
    return da - db;
  });

  const blockers = [anchorBox, ...occupiedBoxes];
  const placements = [];

  for (const item of pulledItems) {
    const { w, h } = computeThumbSize(item, thumbSize);
    let chosen = null;

    for (const [gx, gy] of candidateOffsets) {
      const cx = acx + gx * stepX;
      const cy = acy + gy * stepY;
      const rect = {
        item,
        x: Math.round(cx - w / 2),
        y: Math.round(cy - h / 2),
        w,
        h
      };

      const hit = blockers.some((b) => rectsCollideWithMargin(rect, b, gap * 0.5));
      if (!hit) {
        chosen = rect;
        break;
      }
    }

    if (!chosen) {
      // Fallback far slot if dense
      const idx = placements.length;
      chosen = {
        item,
        x: Math.round(anchorBox.x + anchorBox.w + gap + idx * (w + gap)),
        y: Math.round(anchorBox.y),
        w,
        h
      };
    }

    blockers.push(chosen);
    placements.push(chosen);
  }

  return placements;
}

/**
 * Bin-packs a marquee-selected subgroup of stacked items so zero items overlap,
 * centered right over the original selection's bounding-box midpoint.
 */
export function packSelectedSubgroup(selectedLayoutItems, thumbSize = 180, gap = 6) {
  if (!selectedLayoutItems || selectedLayoutItems.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const li of selectedLayoutItems) {
    const x = li.curX ?? li.x;
    const y = li.curY ?? li.y;
    const w = li.curW ?? li.w;
    const h = li.curH ?? li.h;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  const origMidX = (minX + maxX) / 2;
  const origMidY = (minY + maxY) / 2;

  const rawItems = selectedLayoutItems.map((li) => li.item);
  const packed = packLayout(rawItems, thumbSize, gap);

  const offsetX = Math.round(origMidX - packed.width / 2);
  const offsetY = Math.round(origMidY - packed.height / 2);

  return packed.items.map((pi) => ({
    item: pi.item,
    x: pi.x + offsetX,
    y: pi.y + offsetY,
    w: pi.w,
    h: pi.h
  }));
}
