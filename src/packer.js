// Spatial layout solvers: Growing 2D Bin Packer, Justified Grid, 2D Scatter (PCA/UMAP), Cluster Islands, and 2D Color Map

export const CLUSTER_PALETTE = [
  '#2563eb', // Cobalt
  '#0d9488', // Teal
  '#d97706', // Amber
  '#e11d48', // Crimson Rose
  '#7c3aed', // Violet
  '#16a34a', // Forest
  '#ea580c', // Burnt Orange
  '#0284c7', // Sky
  '#9333ea', // Plum
  '#4f46e5', // Indigo
  '#65a30d', // Olive
  '#be123c', // Ruby
  '#0f766e', // Deep Teal
  '#b45309', // Ochre
  '#4338ca', // Royal
  '#52525b'  // Zinc
];

export function getClusterColor(clusterId) {
  if (clusterId === undefined || clusterId === null || clusterId < 0) return '#71717a';
  return CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length];
}

function getSafeDimensions(item, baseSize) {
  const iw = item.width > 0 ? item.width : 200;
  const ih = item.height > 0 ? item.height : 200;
  const aspect = iw / ih;
  const snap = (v) => Math.max(12, Math.round(v / 4) * 4);
  let w;
  let h;
  if (iw >= ih) {
    w = snap(baseSize);
    h = snap(baseSize / aspect);
  } else {
    h = snap(baseSize);
    w = snap(baseSize * aspect);
  }
  return { w, h, aspect };
}

export class GrowingPacker {
  constructor() {
    this.root = null;
  }

  fit(blocks) {
    const len = blocks.length;
    const w = len > 0 ? blocks[0].w : 0;
    const h = len > 0 ? blocks[0].h : 0;
    this.root = { x: 0, y: 0, w, h };

    for (let n = 0; n < len; n++) {
      const block = blocks[n];
      const node = this.findNode(this.root, block.w, block.h);
      if (node) {
        block.fit = this.splitNode(node, block.w, block.h);
      } else {
        block.fit = this.growNode(block.w, block.h);
      }
    }
  }

  findNode(root, w, h) {
    if (root.used) {
      return this.findNode(root.right, w, h) || this.findNode(root.down, w, h);
    } else if (w <= root.w && h <= root.h) {
      return root;
    }
    return null;
  }

  splitNode(node, w, h) {
    node.used = true;
    node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h };
    node.right = { x: node.x + w, y: node.y, w: node.w - w, h };
    return node;
  }

  growNode(w, h) {
    const canGrowDown = w <= this.root.w;
    const canGrowRight = h <= this.root.h;

    const shouldGrowRight = canGrowRight && this.root.h >= this.root.w;
    const shouldGrowDown = canGrowDown && this.root.w >= this.root.h;

    if (shouldGrowRight) return this.growRight(w, h);
    if (shouldGrowDown) return this.growDown(w, h);
    if (canGrowRight) return this.growRight(w, h);
    if (canGrowDown) return this.growDown(w, h);
    return null;
  }

  growRight(w, h) {
    this.root = {
      used: true,
      x: 0,
      y: 0,
      w: this.root.w + w,
      h: this.root.h,
      down: this.root,
      right: { x: this.root.w, y: 0, w, h: this.root.h }
    };
    const node = this.findNode(this.root, w, h);
    return node ? this.splitNode(node, w, h) : null;
  }

  growDown(w, h) {
    this.root = {
      used: true,
      x: 0,
      y: 0,
      w: this.root.w,
      h: this.root.h + h,
      down: { x: 0, y: this.root.h, w: this.root.w, h },
      right: this.root
    };
    const node = this.findNode(this.root, w, h);
    return node ? this.splitNode(node, w, h) : null;
  }
}

/**
 * Computes 2D Bin Packing layout.
 */
export function packLayout(items, baseSize, gap) {
  if (items.length === 0) return { mode: 'pack', items: [], width: 0, height: 0 };

  const blocks = items.map((item, idx) => {
    const { w, h } = getSafeDimensions(item, baseSize);
    return {
      index: idx,
      item,
      w: w + gap,
      h: h + gap,
      origW: w,
      origH: h
    };
  });

  blocks.sort(
    (a, b) =>
      Math.max(b.w, b.h) - Math.max(a.w, a.h) ||
      b.w * b.h - a.w * a.h ||
      b.h - a.h ||
      b.w - a.w
  );

  const packer = new GrowingPacker();
  packer.fit(blocks);

  const layoutItems = [];
  for (const block of blocks) {
    if (block.fit) {
      const x = block.fit.x;
      const y = block.fit.y;
      layoutItems.push({
        item: block.item,
        x,
        y,
        w: block.origW,
        h: block.origH,
        pointX: x + block.origW / 2,
        pointY: y + block.origH / 2
      });
    }
  }

  return {
    mode: 'pack',
    items: layoutItems,
    width: packer.root ? Math.max(0, packer.root.w - gap) : 0,
    height: packer.root ? Math.max(0, packer.root.h - gap) : 0
  };
}

/**
 * Computes Justified Row layout.
 */
export function justifyLayout(items, containerWidth, targetRowHeight, gap) {
  if (items.length === 0) return { mode: 'grid', items: [], width: 0, height: 0 };

  const safeWidth = Math.max(300, containerWidth);
  let row = [];
  let rowWidth = 0;
  const layoutItems = [];
  let y = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const iw = item.width > 0 ? item.width : 200;
    const ih = item.height > 0 ? item.height : 200;
    const aspect = iw / ih;
    const w = targetRowHeight * aspect;
    row.push({ item, aspect, w });
    rowWidth += w;

    const gapsCount = row.length - 1;
    const totalRowWidthWithGaps = rowWidth + gapsCount * gap;

    if (totalRowWidthWithGaps >= safeWidth - gap || i === items.length - 1) {
      let shouldStretch = true;
      if (i === items.length - 1 && totalRowWidthWithGaps < safeWidth * 0.7) {
        shouldStretch = false;
      }

      let rowHeight = targetRowHeight;
      if (shouldStretch) {
        const sumAspect = row.reduce((sum, r) => sum + r.aspect, 0);
        if (sumAspect > 0) {
          rowHeight = (safeWidth - gapsCount * gap) / sumAspect;
        }
      }

      let x = 0;
      for (const r of row) {
        const finalWidth = rowHeight * r.aspect;
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rw = Math.max(8, Math.round(finalWidth));
        const rh = Math.max(8, Math.round(rowHeight));
        layoutItems.push({
          item: r.item,
          x: rx,
          y: ry,
          w: rw,
          h: rh,
          pointX: rx + rw / 2,
          pointY: ry + rh / 2
        });
        x += finalWidth + gap;
      }

      y += rowHeight + gap;
      row = [];
      rowWidth = 0;
    }
  }

  return {
    mode: 'grid',
    items: layoutItems,
    width: safeWidth,
    height: y > 0 ? y - gap : 0
  };
}

function relaxSpriteCollisions(layoutItems, worldW, worldH, iterations = 6) {
  const n = layoutItems.length;
  if (n <= 1 || n > 1200) return;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      const a = layoutItems[i];
      const acx = a.x + a.w / 2;
      const acy = a.y + a.h / 2;

      for (let j = i + 1; j < n; j++) {
        const b = layoutItems[j];
        const bcx = b.x + b.w / 2;
        const bcy = b.y + b.h / 2;

        const minDx = (a.w + b.w) * 0.52;
        const minDy = (a.h + b.h) * 0.52;
        const dx = bcx - acx;
        const dy = bcy - acy;

        if (Math.abs(dx) < minDx && Math.abs(dy) < minDy) {
          const overlapX = minDx - Math.abs(dx);
          const overlapY = minDy - Math.abs(dy);
          if (overlapX < overlapY) {
            const sign = dx >= 0 ? 1 : -1;
            const push = overlapX * 0.35 * sign;
            a.x -= push;
            b.x += push;
          } else {
            const sign = dy >= 0 ? 1 : -1;
            const push = overlapY * 0.35 * sign;
            a.y -= push;
            b.y += push;
          }
        }
      }
      a.x = Math.max(0, Math.min(worldW - a.w, a.x));
      a.y = Math.max(0, Math.min(worldH - a.h, a.y));
    }
  }
}

function extractClusterLandmarks(layoutItems) {
  const byCluster = new Map();
  for (const li of layoutItems) {
    const cid = li.item.clusterId;
    if (cid === undefined || cid === null) continue;
    if (!byCluster.has(cid)) byCluster.set(cid, []);
    byCluster.get(cid).push(li);
  }

  const landmarks = [];
  for (const [cid, list] of byCluster.entries()) {
    if (list.length === 0) continue;
    // Prefer explicit medoid if present in view, else item closest to 2D centroid
    let chosen = list.find((li) => li.item.isMedoid);
    let cx = 0;
    let cy = 0;
    for (const li of list) {
      cx += li.pointX;
      cy += li.pointY;
    }
    cx /= list.length;
    cy /= list.length;

    if (!chosen) {
      let bestD = Infinity;
      for (const li of list) {
        const d = (li.pointX - cx) ** 2 + (li.pointY - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          chosen = li;
        }
      }
    }

    landmarks.push({
      clusterId: cid,
      color: getClusterColor(cid),
      count: list.length,
      centerX: cx,
      centerY: cy,
      layoutItem: chosen,
      item: chosen.item
    });
  }

  landmarks.sort((a, b) => a.clusterId - b.clusterId);
  return landmarks;
}

/**
 * 2D Scatter Plane layout for PCA and UMAP coordinates.
 */
export function scatterLayout(items, coordKey = 'pca', options = {}) {
  if (items.length === 0) {
    return { mode: 'scatter', items: [], width: 0, height: 0, axes: null, landmarks: [] };
  }

  const thumbSize = Math.max(28, Math.min(options.thumbSize ?? 96, 260));
  const spread = Math.max(1400, Math.round(Math.sqrt(items.length) * thumbSize * 2.1));
  const pad = Math.round(thumbSize * 1.4);
  const worldW = spread + pad * 2;
  const worldH = Math.round(spread * 0.78) + pad * 2;

  const usableW = worldW - pad * 2;
  const usableH = worldH - pad * 2;

  const layoutItems = items.map((item, idx) => {
    const coords = item[coordKey];
    let nx = 0;
    let ny = 0;
    if (Array.isArray(coords) && coords.length >= 2) {
      nx = coords[0];
      ny = coords[1];
    } else {
      // Deterministic spiral fallback while worker finishes
      const angle = idx * 2.39996;
      const r = Math.sqrt((idx + 0.5) / Math.max(1, items.length)) * 0.85;
      nx = Math.cos(angle) * r;
      ny = Math.sin(angle) * r;
    }

    const px = pad + ((nx + 1) / 2) * usableW;
    const py = pad + ((1 - ny) / 2) * usableH; // +Y points up mathematically
    const { w, h } = getSafeDimensions(item, thumbSize);

    return {
      item,
      x: Math.round(px - w / 2),
      y: Math.round(py - h / 2),
      w,
      h,
      pointX: px,
      pointY: py
    };
  });

  if (options.relaxOverlaps) {
    relaxSpriteCollisions(layoutItems, worldW, worldH, 5);
  }

  const landmarks = extractClusterLandmarks(layoutItems);

  return {
    mode: 'scatter',
    coordKey,
    items: layoutItems,
    width: worldW,
    height: worldH,
    landmarks,
    axes: {
      xLabel: options.xLabel || (coordKey === 'pca' ? 'PC 1' : 'UMAP 1'),
      yLabel: options.yLabel || (coordKey === 'pca' ? 'PC 2' : 'UMAP 2'),
      originX: worldW / 2,
      originY: worldH / 2,
      pad
    }
  };
}

/**
 * Groups images into distinct visual Cluster Islands with headers & medoid landmarks.
 */
export function clusterIslandsLayout(items, baseSize = 110, gap = 6) {
  if (items.length === 0) {
    return { mode: 'clusters', items: [], width: 0, height: 0, islands: [], landmarks: [] };
  }

  const groups = new Map();
  for (const item of items) {
    const cid = item.clusterId ?? 0;
    if (!groups.has(cid)) groups.set(cid, []);
    groups.get(cid).push(item);
  }

  const sortedIds = Array.from(groups.keys()).sort((a, b) => a - b);
  const islandGap = Math.max(48, Math.round(baseSize * 0.55));
  const islandPad = 24;
  const headerH = 56;

  const builtIslands = sortedIds.map((cid) => {
    const groupItems = groups.get(cid);
    const subPack = packLayout(groupItems, baseSize, gap);
    const medoid = groupItems.find((it) => it.isMedoid) || groupItems[0];

    // Dominant theme inside this cluster for readable island title
    const themeFreq = {};
    for (const it of groupItems) {
      const themes = it.ai?.clipThemes || it.analysis?.themes || [];
      for (const t of themes) themeFreq[t] = (themeFreq[t] || 0) + 1;
    }
    const topTheme = Object.entries(themeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const w = Math.max(240, subPack.width + islandPad * 2);
    const h = Math.max(160, subPack.height + headerH + islandPad * 2);

    return {
      clusterId: cid,
      color: getClusterColor(cid),
      count: groupItems.length,
      subtitle: topTheme,
      title: topTheme ? `Cluster ${cid + 1} · ${topTheme}` : `Cluster ${cid + 1}`,
      medoidItem: medoid,
      subPack,
      w,
      h
    };
  });

  // Arrange islands in a balanced multi-column shelf layout
  const cols = Math.max(1, Math.ceil(Math.sqrt(builtIslands.length * 1.25)));
  const layoutItems = [];
  const islands = [];
  const landmarks = [];

  let curX = 0;
  let curY = 0;
  let rowMaxH = 0;
  let maxWorldW = 0;

  builtIslands.forEach((isl, idx) => {
    if (idx > 0 && idx % cols === 0) {
      curX = 0;
      curY += rowMaxH + islandGap;
      rowMaxH = 0;
    }

    const ix = curX;
    const iy = curY;
    const centerX = ix + isl.w / 2;
    const centerY = iy + headerH + (isl.h - headerH) / 2;
    const cloudRadius = Math.min(isl.w, isl.h - headerH) * 0.36;

    let medoidLayoutItem = null;

    isl.subPack.items.forEach((subLi, mIdx) => {
      // Golden-angle phyllotaxis disc inside island for clean Point Cloud view
      const angle = mIdx * 2.399963;
      const rad = Math.sqrt((mIdx + 0.5) / Math.max(1, isl.subPack.items.length)) * cloudRadius;
      const li = {
        item: subLi.item,
        x: ix + islandPad + subLi.x,
        y: iy + headerH + islandPad + subLi.y,
        w: subLi.w,
        h: subLi.h,
        pointX: centerX + Math.cos(angle) * rad,
        pointY: centerY + Math.sin(angle) * rad
      };
      if (subLi.item === isl.medoidItem || !medoidLayoutItem) {
        medoidLayoutItem = li;
      }
      layoutItems.push(li);
    });

    islands.push({
      clusterId: isl.clusterId,
      color: isl.color,
      count: isl.count,
      title: isl.title,
      subtitle: isl.subtitle,
      medoidItem: isl.medoidItem,
      x: ix,
      y: iy,
      w: isl.w,
      h: isl.h,
      headerH
    });

    if (medoidLayoutItem) {
      landmarks.push({
        clusterId: isl.clusterId,
        color: isl.color,
        count: isl.count,
        centerX,
        centerY,
        layoutItem: medoidLayoutItem,
        item: isl.medoidItem
      });
    }

    curX += isl.w + islandGap;
    if (curX - islandGap > maxWorldW) maxWorldW = curX - islandGap;
    if (isl.h > rowMaxH) rowMaxH = isl.h;
  });

  return {
    mode: 'clusters',
    items: layoutItems,
    width: maxWorldW,
    height: curY + rowMaxH,
    islands,
    landmarks
  };
}

/**
 * 2D Color & Lighting Map layout (Hue x Luminance or Color Temp x Exposure).
 */
export function colorMapLayout(items, options = {}) {
  if (items.length === 0) {
    return { mode: 'colormap', items: [], width: 0, height: 0, axes: null, landmarks: [] };
  }

  const thumbSize = Math.max(28, Math.min(options.thumbSize ?? 92, 240));
  const axesMode = options.axesMode || 'hue-lum';
  const spreadW = Math.max(1500, Math.round(Math.sqrt(items.length) * thumbSize * 2.3));
  const spreadH = Math.round(spreadW * 0.68);
  const pad = Math.round(thumbSize * 1.2);
  const worldW = spreadW + pad * 2;
  const worldH = spreadH + pad * 2;
  const usableW = worldW - pad * 2;
  const usableH = worldH - pad * 2;

  const layoutItems = items.map((item, idx) => {
    const a = item.analysis;
    let tx = (idx % 12) / 11;
    let ty = 0.5;

    if (a) {
      if (axesMode === 'temp-exp') {
        // X: Cool (-1) to Warm (+1), Y: Bright (top) to Dark (bottom)
        tx = Math.max(0, Math.min(1, ((a.photo?.temperature ?? 0) + 1) / 2));
        ty = 1 - Math.max(0, Math.min(1, (a.photo?.brightness ?? 128) / 255));
      } else {
        // Hue (0..360) across left 88%, low-saturation neutrals in right 10% strip
        const hsl = a.primaryHsl || { h: 0, s: 0, l: 0.5 };
        if (hsl.s < 0.1) {
          tx = 0.92 + (idx % 5) * 0.015;
        } else {
          tx = (hsl.h / 360) * 0.86;
        }
        ty = 1 - Math.max(0, Math.min(1, hsl.l));
      }
    }

    const px = pad + tx * usableW;
    const py = pad + ty * usableH;
    const { w, h } = getSafeDimensions(item, thumbSize);

    return {
      item,
      x: Math.round(px - w / 2),
      y: Math.round(py - h / 2),
      w,
      h,
      pointX: px,
      pointY: py
    };
  });

  if (options.relaxOverlaps) {
    relaxSpriteCollisions(layoutItems, worldW, worldH, 4);
  }

  return {
    mode: 'colormap',
    axesMode,
    items: layoutItems,
    width: worldW,
    height: worldH,
    landmarks: extractClusterLandmarks(layoutItems),
    axes: {
      xLabel: axesMode === 'temp-exp' ? 'Color Temp (Cool -> Warm)' : 'Hue Spectrum (0-360 deg + Neutrals)',
      yLabel: axesMode === 'temp-exp' ? 'Exposure (Dark -> Bright)' : 'Luminance (Dark -> Light)',
      originX: worldW / 2,
      originY: worldH / 2,
      pad,
      isHueSpectrum: axesMode !== 'temp-exp'
    }
  };
}
