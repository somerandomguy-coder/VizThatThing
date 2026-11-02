// High-DPI Spatial Viewport Engine supporting Image Sprites, Point Cloud + Landmarks, Smooth Transitions & BBox Overlays

import { getClusterColor } from './packer.js';

const THEME_PALETTES = {
  light: {
    canvasBg: '#f6f6f4',
    gridDot: 'rgba(24, 24, 27, 0.07)',
    axisLine: 'rgba(24, 24, 27, 0.14)',
    axisText: '#52525b',
    islandBg: '#ffffff',
    islandBorder: '#e2e2df',
    islandTitle: '#18181b',
    islandSub: '#71717a',
    thumbPlaceholder: '#e9e9e6',
    thumbBorder: 'rgba(24, 24, 27, 0.10)',
    hoverRing: '#2563eb',
    pointStroke: '#ffffff',
    landmarkFrame: '#ffffff',
    emptyText: '#71717a'
  },
  dark: {
    canvasBg: '#0f1115',
    gridDot: 'rgba(255, 255, 255, 0.06)',
    axisLine: 'rgba(255, 255, 255, 0.14)',
    axisText: '#a1a1aa',
    islandBg: '#181b22',
    islandBorder: '#272b36',
    islandTitle: '#f4f4f5',
    islandSub: '#a1a1aa',
    thumbPlaceholder: '#1f232d',
    thumbBorder: 'rgba(255, 255, 255, 0.10)',
    hoverRing: '#3b82f6',
    pointStroke: '#0f1115',
    landmarkFrame: '#181b22',
    emptyText: '#71717a'
  }
};

export class CanvasEngine {
  constructor(canvasEl, datasetHandler) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.datasetHandler = datasetHandler;

    this.layout = { mode: 'pack', items: [], width: 0, height: 0, islands: [], landmarks: [], axes: null };
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minScale = 0.03;
    this.maxScale = 12.0;

    // Display options
    this.theme = 'light'; // 'light' | 'dark'
    this.renderStyle = 'sprites'; // 'sprites' | 'points'
    this.colorBy = 'cluster'; // 'none' | 'cluster' | 'prediction' | 'dominant' | 'exposure' | 'sharpness'
    this.showBboxes = true;
    this.showLabels = true;
    this.showLandmarks = true;

    this.hoveredItem = null;
    this.peerEngine = null;
    this.isLinked = false;

    this.onHoverChange = null;
    this.onItemClick = null;
    this.onScaleChange = null;

    this.loadingItems = new Set();

    // Pointer drag vs click tracking
    this.isDragging = false;
    this.dragMoved = false;
    this.downClientX = 0;
    this.downClientY = 0;
    this.startX = 0;
    this.startY = 0;

    // Layout transition animation
    this.animFrame = null;
    this.animStart = 0;
    this.animDuration = 320;
    this.fromPositions = new Map();

    this.setupEvents();
    this.resize();
  }

  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
    this.draw();
  }

  setDisplayOptions(opts = {}) {
    if (opts.renderStyle !== undefined) this.renderStyle = opts.renderStyle;
    if (opts.colorBy !== undefined) this.colorBy = opts.colorBy;
    if (opts.showBboxes !== undefined) this.showBboxes = opts.showBboxes;
    if (opts.showLabels !== undefined) this.showLabels = opts.showLabels;
    if (opts.showLandmarks !== undefined) this.showLandmarks = opts.showLandmarks;
    this.draw();
  }

  resize() {
    if (!this.canvas.parentElement) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setLayout(nextLayout, options = { animate: true, fit: true }) {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }

    const canAnimate =
      options.animate !== false &&
      this.layout.items.length > 0 &&
      nextLayout.items.length > 0 &&
      nextLayout.items.length <= 800;

    if (canAnimate) {
      this.fromPositions.clear();
      for (const li of this.layout.items) {
        this.fromPositions.set(li.item.fullPath, {
          x: li.curX ?? li.x,
          y: li.curY ?? li.y,
          w: li.curW ?? li.w,
          h: li.curH ?? li.h,
          pointX: li.curPX ?? li.pointX,
          pointY: li.curPY ?? li.pointY
        });
      }
    } else {
      this.fromPositions.clear();
    }

    this.layout = nextLayout;

    if (options.fit !== false) {
      this.zoomToFit(false);
    }

    if (canAnimate && this.fromPositions.size > 0) {
      this.animStart = performance.now();
      const tick = (now) => {
        const elapsed = now - this.animStart;
        const t = Math.min(1, elapsed / this.animDuration);
        const ease = 1 - Math.pow(1 - t, 3); // Cubic ease-out

        for (const li of this.layout.items) {
          const prev = this.fromPositions.get(li.item.fullPath);
          if (prev) {
            li.curX = prev.x + (li.x - prev.x) * ease;
            li.curY = prev.y + (li.y - prev.y) * ease;
            li.curW = prev.w + (li.w - prev.w) * ease;
            li.curH = prev.h + (li.h - prev.h) * ease;
            li.curPX = prev.pointX + (li.pointX - prev.pointX) * ease;
            li.curPY = prev.pointY + (li.pointY - prev.pointY) * ease;
          } else {
            li.curX = li.x;
            li.curY = li.y;
            li.curW = li.w;
            li.curH = li.h;
            li.curPX = li.pointX;
            li.curPY = li.pointY;
          }
        }

        this.draw();
        if (t < 1) {
          this.animFrame = requestAnimationFrame(tick);
        } else {
          this.animFrame = null;
          this.fromPositions.clear();
        }
      };
      this.animFrame = requestAnimationFrame(tick);
    } else {
      for (const li of this.layout.items) {
        li.curX = li.x;
        li.curY = li.y;
        li.curW = li.w;
        li.curH = li.h;
        li.curPX = li.pointX;
        li.curPY = li.pointY;
      }
      this.draw();
    }
  }

  setPeerEngine(peer, linked = false) {
    this.peerEngine = peer;
    this.isLinked = linked;
  }

  setLinked(linked) {
    this.isLinked = linked;
    if (linked && this.peerEngine) {
      this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
    }
  }

  syncViewport(scale, offsetX, offsetY) {
    this.scale = scale;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    if (this.onScaleChange) this.onScaleChange(this.scale);
    this.draw();
  }

  zoomToFit(redraw = true) {
    if (this.layout.items.length === 0) {
      if (redraw) this.draw();
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const containerW = this.canvas.width / dpr;
    const containerH = this.canvas.height / dpr;

    const topSafe = 44;
    const bottomSafe = 48;
    const padX = 48;
    const availW = Math.max(80, containerW - padX * 2);
    const availH = Math.max(80, containerH - topSafe - bottomSafe);

    const layoutW = this.layout.width || 1;
    const layoutH = this.layout.height || 1;

    const scaleX = availW / layoutW;
    const scaleY = availH / layoutH;
    this.scale = Math.max(this.minScale, Math.min(scaleX, scaleY, 1.25));

    this.offsetX = (containerW - layoutW * this.scale) / 2;
    this.offsetY = topSafe + (availH - layoutH * this.scale) / 2;

    if (this.onScaleChange) this.onScaleChange(this.scale);
    if (redraw) this.draw();

    if (this.isLinked && this.peerEngine) {
      this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
    }
  }

  zoomIn() {
    this.zoom(1.25);
  }

  zoomOut() {
    this.zoom(0.8);
  }

  zoom(factor) {
    const dpr = window.devicePixelRatio || 1;
    const cx = this.canvas.width / dpr / 2;
    const cy = this.canvas.height / dpr / 2;

    const worldX = (cx - this.offsetX) / this.scale;
    const worldY = (cy - this.offsetY) / this.scale;

    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    this.offsetX = cx - worldX * this.scale;
    this.offsetY = cy - worldY * this.scale;

    if (this.onScaleChange) this.onScaleChange(this.scale);
    this.draw();
    this.manageMemory();

    if (this.isLinked && this.peerEngine) {
      this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
    }
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragMoved = false;
        this.downClientX = e.clientX;
        this.downClientY = e.clientY;
        this.startX = e.clientX - this.offsetX;
        this.startY = e.clientY - this.offsetY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dist = Math.hypot(e.clientX - this.downClientX, e.clientY - this.downClientY);
      if (dist > 4) {
        this.dragMoved = true;
        if (this.hoveredItem && this.onHoverChange) {
          this.onHoverChange(null);
        }
      }
      this.offsetX = e.clientX - this.startX;
      this.offsetY = e.clientY - this.startY;
      this.draw();

      if (this.isLinked && this.peerEngine) {
        this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.manageMemory();
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) return;

      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hit = this.getItemAtCoords(mx, my);
      if (hit !== this.hoveredItem) {
        this.hoveredItem = hit;
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.draw();
      }
      if (this.onHoverChange) {
        this.onHoverChange(this.hoveredItem, e.clientX, e.clientY);
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoveredItem) {
        this.hoveredItem = null;
        this.draw();
        if (this.onHoverChange) this.onHoverChange(null);
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.dragMoved) {
        this.dragMoved = false;
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const clickedItem = this.getItemAtCoords(mx, my);
      if (clickedItem && this.onItemClick) {
        this.onItemClick(clickedItem);
      }
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const worldX = (mx - this.offsetX) / this.scale;
        const worldY = (my - this.offsetY) / this.scale;

        const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));
        this.offsetX = mx - worldX * this.scale;
        this.offsetY = my - worldY * this.scale;

        if (this.onScaleChange) this.onScaleChange(this.scale);
        this.draw();
        this.manageMemory();

        if (this.isLinked && this.peerEngine) {
          this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
        }
      },
      { passive: false }
    );
  }

  isPointModeActive() {
    const m = this.layout.mode;
    return (
      this.renderStyle === 'points' &&
      (m === 'scatter' || m === 'clusters' || m === 'colormap')
    );
  }

  getItemAtCoords(mx, my) {
    const wx = (mx - this.offsetX) / this.scale;
    const wy = (my - this.offsetY) / this.scale;

    if (this.isPointModeActive()) {
      // 1. Check pinned landmark thumbnails first
      if (this.showLandmarks && this.layout.landmarks) {
        const lmScreenSize = 54 / this.scale;
        for (const lm of this.layout.landmarks) {
          const lx = lm.centerX - lmScreenSize / 2;
          const ly = lm.centerY - lmScreenSize - 10 / this.scale;
          if (wx >= lx && wx <= lx + lmScreenSize && wy >= ly && wy <= ly + lmScreenSize) {
            return lm.layoutItem;
          }
        }
      }

      // 2. Find closest point within 11px screen radius
      const hitRadiusWorld = 11 / this.scale;
      const hitSq = hitRadiusWorld * hitRadiusWorld;
      let bestItem = null;
      let bestDistSq = hitSq;

      for (const li of this.layout.items) {
        const px = li.curPX ?? li.pointX;
        const py = li.curPY ?? li.pointY;
        const dSq = (wx - px) * (wx - px) + (wy - py) * (wy - py);
        if (dSq <= bestDistSq) {
          bestDistSq = dSq;
          bestItem = li;
        }
      }
      return bestItem;
    }

    // Standard sprite hit-testing (iterate reverse so top-most drawn sprite wins)
    for (let i = this.layout.items.length - 1; i >= 0; i--) {
      const li = this.layout.items[i];
      const x = li.curX ?? li.x;
      const y = li.curY ?? li.y;
      const w = li.curW ?? li.w;
      const h = li.curH ?? li.h;
      if (wx >= x && wx <= x + w && wy >= y && wy <= y + h) {
        return li;
      }
    }
    return null;
  }

  resolveItemColor(item) {
    const mode = this.colorBy;
    if (mode === 'dominant') {
      return item.analysis?.dominantHex || '#71717a';
    }
    if (mode === 'prediction') {
      const m = item.metadata;
      if (m) {
        const pred = m.prediction ?? m.pred;
        const label = m.label ?? m.ground_truth ?? m.gt;
        if (pred !== undefined && label !== undefined) {
          return String(pred) === String(label) ? '#15803d' : '#dc2626';
        }
      }
      return '#94a3b8';
    }
    if (mode === 'exposure') {
      const st = item.analysis?.photo?.exposureStatus;
      if (st === 'Underexposed') return '#2563eb';
      if (st === 'Overexposed') return '#dc2626';
      if (st === 'Low Contrast') return '#ca8a04';
      return '#16a34a';
    }
    if (mode === 'sharpness') {
      const sh = item.analysis?.photo?.sharpnessLabel;
      if (sh === 'Blurry') return '#dc2626';
      if (sh === 'Soft') return '#d97706';
      return '#15803d';
    }
    if (mode === 'cluster') {
      return getClusterColor(item.clusterId ?? 0);
    }
    return null;
  }

  draw() {
    const dpr = window.devicePixelRatio || 1;
    const containerW = this.canvas.width / dpr;
    const containerH = this.canvas.height / dpr;
    const pal = THEME_PALETTES[this.theme];

    this.ctx.fillStyle = pal.canvasBg;
    this.ctx.fillRect(0, 0, containerW, containerH);
    this.drawSubtleGrid(containerW, containerH, pal);

    if (this.layout.items.length === 0) {
      this.ctx.fillStyle = pal.emptyText;
      this.ctx.font = '500 13px "Inter", system-ui, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('No images match the current folder or filters.', containerW / 2, containerH / 2);
      return;
    }

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    const left = -this.offsetX / this.scale;
    const top = -this.offsetY / this.scale;
    const right = (containerW - this.offsetX) / this.scale;
    const bottom = (containerH - this.offsetY) / this.scale;

    // 1. Spatial backdrop chrome (Axes or Cluster Islands)
    if (this.layout.axes) {
      this.drawAxesBackdrop(this.layout.axes, pal);
    }
    if (this.layout.islands && this.layout.islands.length > 0) {
      this.drawClusterIslands(this.layout.islands, pal);
    }

    // 2. Render either Point Cloud + Landmarks OR Image Sprites
    if (this.isPointModeActive()) {
      this.drawPointCloud(left, top, right, bottom, pal);
    } else {
      const visibleItems = [];
      for (const li of this.layout.items) {
        const x = li.curX ?? li.x;
        const y = li.curY ?? li.y;
        const w = li.curW ?? li.w;
        const h = li.curH ?? li.h;

        if (x + w < left || x > right || y + h < top || y > bottom) continue;
        visibleItems.push(li);
        this.drawSpriteItem(li, x, y, w, h, pal);
      }

      // Draw hovered sprite on top so its border isn't occluded
      if (this.hoveredItem && visibleItems.includes(this.hoveredItem)) {
        const hLi = this.hoveredItem;
        this.drawSpriteItem(
          hLi,
          hLi.curX ?? hLi.x,
          hLi.curY ?? hLi.y,
          hLi.curW ?? hLi.w,
          hLi.curH ?? hLi.h,
          pal
        );
      }

      this.loadVisibleImages(visibleItems);
    }

    this.ctx.restore();
  }

  drawSubtleGrid(w, h, pal) {
    const step = 28;
    const ox = ((this.offsetX % step) + step) % step;
    const oy = ((this.offsetY % step) + step) % step;
    this.ctx.fillStyle = pal.gridDot;
    for (let y = oy; y < h; y += step) {
      for (let x = ox; x < w; x += step) {
        this.ctx.fillRect(x, y, 1.25, 1.25);
      }
    }
  }

  drawAxesBackdrop(axes, pal) {
    const w = this.layout.width;
    const h = this.layout.height;
    const pad = axes.pad || 80;
    const inv = 1 / this.scale;

    this.ctx.strokeStyle = pal.axisLine;
    this.ctx.lineWidth = 1 * inv;

    // Outer frame
    this.ctx.strokeRect(pad * 0.6, pad * 0.6, w - pad * 1.2, h - pad * 1.2);

    // Origin crosshair
    this.ctx.beginPath();
    this.ctx.setLineDash([5 * inv, 5 * inv]);
    this.ctx.moveTo(axes.originX, pad * 0.6);
    this.ctx.lineTo(axes.originX, h - pad * 0.6);
    this.ctx.moveTo(pad * 0.6, axes.originY);
    this.ctx.lineTo(w - pad * 0.6, axes.originY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Optional Hue Rainbow Strip along bottom for Color Map
    if (axes.isHueSpectrum) {
      const barY = h - pad * 0.55;
      const barH = 6 * inv;
      const barX = pad;
      const barW = (w - pad * 2) * 0.86;
      const grad = this.ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#ef4444');
      grad.addColorStop(0.17, '#eab308');
      grad.addColorStop(0.33, '#22c55e');
      grad.addColorStop(0.5, '#06b6d4');
      grad.addColorStop(0.67, '#3b82f6');
      grad.addColorStop(0.83, '#a855f7');
      grad.addColorStop(1, '#ef4444');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(barX, barY, barW, barH);
    }

    // Axis labels
    const fontSize = Math.max(10, 11 * inv);
    this.ctx.fillStyle = pal.axisText;
    this.ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(axes.xLabel, w / 2, h - pad * 0.42);

    this.ctx.save();
    this.ctx.translate(pad * 0.35, h / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(axes.yLabel, 0, 0);
    this.ctx.restore();
  }

  drawClusterIslands(islands, pal) {
    const inv = 1 / this.scale;
    for (const isl of islands) {
      // Card surface
      this.ctx.fillStyle = pal.islandBg;
      this.ctx.strokeStyle = pal.islandBorder;
      this.ctx.lineWidth = 1.2 * inv;

      this.roundRect(isl.x, isl.y, isl.w, isl.h, 10 * inv);
      this.ctx.fill();
      this.ctx.stroke();

      // Top color accent bar
      this.ctx.fillStyle = isl.color;
      this.ctx.fillRect(isl.x + 12 * inv, isl.y + 14 * inv, 10 * inv, 10 * inv);

      // Header text
      const titleFont = Math.max(11, Math.min(13 / this.scale, 28));
      this.ctx.fillStyle = pal.islandTitle;
      this.ctx.font = `600 ${titleFont}px "Inter", system-ui, sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(isl.title, isl.x + 28 * inv, isl.y + 19 * inv);

      this.ctx.fillStyle = pal.islandSub;
      this.ctx.font = `500 ${titleFont * 0.88}px "JetBrains Mono", monospace`;
      this.ctx.textAlign = 'right';
      this.ctx.fillText(`${isl.count} imgs`, isl.x + isl.w - 14 * inv, isl.y + 19 * inv);
    }
  }

  drawPointCloud(left, top, right, bottom, pal) {
    const inv = 1 / this.scale;
    const baseRadius = 5.2 * inv;

    // 1. Draw all data points
    for (const li of this.layout.items) {
      const px = li.curPX ?? li.pointX;
      const py = li.curPY ?? li.pointY;
      if (px + baseRadius < left || px - baseRadius > right || py + baseRadius < top || py - baseRadius > bottom) {
        continue;
      }

      const isHover = this.hoveredItem === li;
      const r = isHover ? 8.5 * inv : baseRadius;
      const fill = this.resolveItemColor(li.item) || getClusterColor(li.item.clusterId ?? 0);

      this.ctx.beginPath();
      this.ctx.arc(px, py, r, 0, Math.PI * 2);
      this.ctx.fillStyle = fill;
      this.ctx.fill();

      this.ctx.lineWidth = (isHover ? 2.4 : 1.1) * inv;
      this.ctx.strokeStyle = isHover ? pal.hoverRing : pal.pointStroke;
      this.ctx.stroke();
    }

    // 2. Draw pinned representative landmark thumbnails at cluster centroids
    if (this.showLandmarks && this.layout.landmarks && this.layout.landmarks.length > 0) {
      const landmarkToLoad = [];
      const boxSize = 52 * inv;

      for (const lm of this.layout.landmarks) {
        const lx = lm.centerX - boxSize / 2;
        const ly = lm.centerY - boxSize - 10 * inv;

        // Connector stem to centroid
        this.ctx.beginPath();
        this.ctx.moveTo(lm.centerX, ly + boxSize);
        this.ctx.lineTo(lm.centerX, lm.centerY);
        this.ctx.strokeStyle = lm.color;
        this.ctx.lineWidth = 1.6 * inv;
        this.ctx.stroke();

        // Thumbnail frame
        this.ctx.fillStyle = pal.landmarkFrame;
        this.ctx.fillRect(lx - 2 * inv, ly - 2 * inv, boxSize + 4 * inv, boxSize + 4 * inv);

        if (lm.item.imageObj && lm.item.imageObj.complete) {
          this.ctx.drawImage(lm.item.imageObj, lx, ly, boxSize, boxSize);
        } else {
          this.ctx.fillStyle = pal.thumbPlaceholder;
          this.ctx.fillRect(lx, ly, boxSize, boxSize);
          landmarkToLoad.push(lm.layoutItem);
        }

        this.ctx.strokeStyle = lm.color;
        this.ctx.lineWidth = 2 * inv;
        this.ctx.strokeRect(lx - 2 * inv, ly - 2 * inv, boxSize + 4 * inv, boxSize + 4 * inv);

        // Small badge pill C1
        const badgeH = 15 * inv;
        const badgeText = `C${lm.clusterId + 1} (${lm.count})`;
        this.ctx.font = `600 ${10 * inv}px "JetBrains Mono", monospace`;
        const badgeW = this.ctx.measureText(badgeText).width + 10 * inv;
        this.ctx.fillStyle = lm.color;
        this.ctx.fillRect(lm.centerX - badgeW / 2, ly - badgeH - 3 * inv, badgeW, badgeH);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(badgeText, lm.centerX, ly - badgeH / 2 - 3 * inv);
      }

      if (landmarkToLoad.length > 0) {
        this.loadVisibleImages(landmarkToLoad);
      }
    }
  }

  drawSpriteItem(layoutItem, x, y, w, h, pal) {
    const item = layoutItem.item;
    const inv = 1 / this.scale;

    this.ctx.fillStyle = pal.thumbPlaceholder;
    this.ctx.fillRect(x, y, w, h);

    if (item.imageObj && item.imageObj.complete) {
      this.ctx.drawImage(item.imageObj, x, y, w, h);
    }

    // Bounding boxes overlay (Faces, Humans, YOLO GT) when visible size is >= 36px on screen
    if (this.showBboxes && w * this.scale >= 36) {
      this.drawItemBoxes(item, x, y, w, h, inv);
    }

    // Border color logic: Prediction status if explicitly present or selected, else colorBy
    let borderStroke = pal.thumbBorder;
    let borderWidth = 1.0 * inv;

    if (this.colorBy !== 'none') {
      const c = this.resolveItemColor(item);
      if (c) {
        borderStroke = c;
        borderWidth = 1.8 * inv;
      }
    } else if (item.metadata) {
      const pred = item.metadata.prediction ?? item.metadata.pred;
      const label = item.metadata.label ?? item.metadata.ground_truth ?? item.metadata.gt;
      if (pred !== undefined && label !== undefined) {
        borderStroke = String(pred) === String(label) ? '#15803d' : '#dc2626';
        borderWidth = 1.8 * inv;
      }
    }

    this.ctx.strokeStyle = borderStroke;
    this.ctx.lineWidth = borderWidth;
    this.ctx.strokeRect(x, y, w, h);

    if (this.hoveredItem === layoutItem) {
      this.ctx.strokeStyle = pal.hoverRing;
      this.ctx.lineWidth = 2.8 * inv;
      this.ctx.strokeRect(x - 1 * inv, y - 1 * inv, w + 2 * inv, h + 2 * inv);
    }

    // Bottom caption strip when zoomed in sufficiently
    if (this.showLabels && w * this.scale >= 95) {
      const stripH = Math.min(19 * inv, h * 0.24);
      this.ctx.fillStyle = 'rgba(15, 17, 21, 0.72)';
      this.ctx.fillRect(x, y + h - stripH, w, stripH);

      this.ctx.fillStyle = '#f8fafc';
      const fontSize = Math.max(8, Math.min(10.5 * inv, 13));
      this.ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';

      let text = item.name;
      if (item.metadata?.confidence !== undefined) {
        text += ` · ${Number(item.metadata.confidence).toFixed(2)}`;
      }
      const maxTextW = w - 8 * inv;
      const measured = this.ctx.measureText(text).width;
      if (measured > maxTextW && maxTextW > 12) {
        const keep = Math.max(4, Math.floor(text.length * (maxTextW / measured)) - 2);
        text = text.slice(0, keep) + '…';
      }
      this.ctx.fillText(text, x + 4 * inv, y + h - stripH / 2);
    }
  }

  drawItemBoxes(item, x, y, w, h, inv) {
    const drawBoxes = (boxes, color) => {
      if (!boxes || boxes.length === 0) return;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1.75 * inv;
      for (const b of boxes) {
        const [bx, by, bw, bh] = b.bbox;
        this.ctx.strokeRect(x + bx * w, y + by * h, bw * w, bh * h);
      }
    };

    drawBoxes(item.annotations, '#16a34a'); // YOLO GT boxes in Forest Green
    drawBoxes(item.ai?.humans, '#d97706');  // Humans in Amber
    drawBoxes(item.ai?.faces, '#2563eb');   // Faces in Cobalt Blue
  }

  roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.arcTo(x + w, y, x + w, y + h, radius);
    this.ctx.arcTo(x + w, y + h, x, y + h, radius);
    this.ctx.arcTo(x, y + h, x, y, radius);
    this.ctx.arcTo(x, y, x + w, y, radius);
    this.ctx.closePath();
  }

  loadVisibleImages(visibleLayoutItems) {
    for (const layoutItem of visibleLayoutItems) {
      const item = layoutItem.item;
      if (item.imageObj || this.loadingItems.has(item.fullPath)) continue;

      this.loadingItems.add(item.fullPath);
      this.datasetHandler
        .getBlobUrl(item)
        .then((blobUrl) => {
          const img = new Image();
          img.onload = () => {
            item.imageObj = img;
            this.loadingItems.delete(item.fullPath);
            this.draw();
          };
          img.onerror = () => {
            this.loadingItems.delete(item.fullPath);
          };
          img.src = blobUrl;
        })
        .catch(() => {
          this.loadingItems.delete(item.fullPath);
        });
    }
  }

  manageMemory() {
    if (this.isPointModeActive()) return;
    const dpr = window.devicePixelRatio || 1;
    const containerW = this.canvas.width / dpr;
    const containerH = this.canvas.height / dpr;

    const left = -this.offsetX / this.scale;
    const top = -this.offsetY / this.scale;
    const right = (containerW - this.offsetX) / this.scale;
    const bottom = (containerH - this.offsetY) / this.scale;

    const marginX = (right - left) * 1.6;
    const marginY = (bottom - top) * 1.6;

    const activeLeft = left - marginX;
    const activeRight = right + marginX;
    const activeTop = top - marginY;
    const activeBottom = bottom + marginY;

    for (const li of this.layout.items) {
      const item = li.item;
      if (!item.blobUrl && !item.imageObj) continue;
      if (item.isMedoid) continue; // Keep cluster landmark thumbnails resident

      if (
        li.x + li.w < activeLeft ||
        li.x > activeRight ||
        li.y + li.h < activeTop ||
        li.y > activeBottom
      ) {
        this.datasetHandler.revokeBlobUrl(item);
      }
    }
  }

  clear() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    for (const li of this.layout.items) {
      this.datasetHandler.revokeBlobUrl(li.item);
    }
    this.layout = { mode: 'pack', items: [], width: 0, height: 0, islands: [], landmarks: [], axes: null };
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hoveredItem = null;
    this.loadingItems.clear();
    this.draw();
  }
}
