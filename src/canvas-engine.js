// Viewport Canvas Engine with zoom, pan, frustum culling, and lazy image loading

export class CanvasEngine {
  /**
   * @param {HTMLCanvasElement} canvasEl - The canvas element
   * @param {ZipHandler} zipHandler - The zip handler instance
   */
  constructor(canvasEl, zipHandler) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.zipHandler = zipHandler;

    this.layout = { items: [], width: 0, height: 0 };
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minScale = 0.05;
    this.maxScale = 8.0;

    this.hoveredItem = null;
    this.selectedItem = null;

    // Viewport-linked peer engine (for synchronized split views)
    this.peerEngine = null;
    this.isLinked = false;

    // Callbacks
    this.onHoverChange = null;
    this.onItemClick = null;

    // Image load requests tracker
    this.loadingItems = new Set();

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;

    this.setupEvents();
    this.resize();
  }

  resize() {
    let rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.draw();
  }

  setLayout(layout) {
    this.layout = layout;
    this.zoomToFit();
  }

  setPeerEngine(peer, linked = false) {
    this.peerEngine = peer;
    this.isLinked = linked;
  }

  setLinked(linked) {
    this.isLinked = linked;
    if (linked && this.peerEngine) {
      // Synchronize peer to this viewport
      this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
    }
  }

  syncViewport(scale, offsetX, offsetY) {
    this.scale = scale;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.draw();
  }

  zoomToFit() {
    if (this.layout.items.length === 0) return;

    let containerW = this.canvas.width / window.devicePixelRatio;
    let containerH = this.canvas.height / window.devicePixelRatio;
    
    let pad = 40;
    let layoutW = this.layout.width;
    let layoutH = this.layout.height;

    if (layoutW === 0 || layoutH === 0) return;

    let scaleX = (containerW - pad) / layoutW;
    let scaleY = (containerH - pad) / layoutH;
    this.scale = Math.min(scaleX, scaleY, 1.0); // Don't zoom in past 100%

    this.offsetX = (containerW - layoutW * this.scale) / 2;
    this.offsetY = (containerH - layoutH * this.scale) / 2;

    this.draw();
    
    if (this.isLinked && this.peerEngine) {
      this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
    }
  }

  setupEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        this.isDragging = true;
        this.startX = e.clientX - this.offsetX;
        this.startY = e.clientY - this.offsetY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.offsetX = e.clientX - this.startX;
        this.offsetY = e.clientY - this.startY;
        this.draw();

        if (this.isLinked && this.peerEngine) {
          this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        // Clean up memory: check which images can be unloaded now
        this.manageMemory();
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) return;
      
      let rect = this.canvas.getBoundingClientRect();
      let mx = e.clientX - rect.left;
      let my = e.clientY - rect.top;
      
      let oldHover = this.hoveredItem;
      this.hoveredItem = this.getItemAtCoords(mx, my);

      if (this.hoveredItem !== oldHover) {
        this.draw();
        if (this.onHoverChange) {
          this.onHoverChange(this.hoveredItem, e.clientX, e.clientY);
        }
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (this.hoveredItem) {
        this.hoveredItem = null;
        this.draw();
        if (this.onHoverChange) {
          this.onHoverChange(null);
        }
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.isDragging) return;
      
      let rect = this.canvas.getBoundingClientRect();
      let mx = e.clientX - rect.left;
      let my = e.clientY - rect.top;
      
      let clickedItem = this.getItemAtCoords(mx, my);
      if (clickedItem && this.onItemClick) {
        this.onItemClick(clickedItem);
      }
    });

    // Zoom event
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      let rect = this.canvas.getBoundingClientRect();
      let mx = e.clientX - rect.left;
      let my = e.clientY - rect.top;

      // Calculate mouse in world coordinates
      let worldX = (mx - this.offsetX) / this.scale;
      let worldY = (my - this.offsetY) / this.scale;

      let zoomFactor = 1.1;
      let newScale = e.deltaY < 0 ? this.scale * zoomFactor : this.scale / zoomFactor;
      newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

      this.scale = newScale;
      this.offsetX = mx - worldX * this.scale;
      this.offsetY = my - worldY * this.scale;

      this.draw();
      this.manageMemory();

      if (this.isLinked && this.peerEngine) {
        this.peerEngine.syncViewport(this.scale, this.offsetX, this.offsetY);
      }
    }, { passive: false });
  }

  getItemAtCoords(mx, my) {
    // Convert screen coordinates to world coordinates
    let wx = (mx - this.offsetX) / this.scale;
    let wy = (my - this.offsetY) / this.scale;

    for (let layoutItem of this.layout.items) {
      if (wx >= layoutItem.x && wx <= layoutItem.x + layoutItem.w &&
          wy >= layoutItem.y && wy <= layoutItem.y + layoutItem.h) {
        return layoutItem;
      }
    }
    return null;
  }

  draw() {
    let containerW = this.canvas.width / window.devicePixelRatio;
    let containerH = this.canvas.height / window.devicePixelRatio;
    
    this.ctx.clearRect(0, 0, containerW, containerH);
    
    if (this.layout.items.length === 0) {
      this.drawEmptyState(containerW, containerH);
      return;
    }

    this.ctx.save();
    // Apply viewport transform
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // Get viewport bounds in world coordinates for culling
    let left = -this.offsetX / this.scale;
    let top = -this.offsetY / this.scale;
    let right = (containerW - this.offsetX) / this.scale;
    let bottom = (containerH - this.offsetY) / this.scale;

    let visibleItems = [];

    // Draw images
    for (let layoutItem of this.layout.items) {
      // Frustum culling check
      if (layoutItem.x + layoutItem.w < left || layoutItem.x > right ||
          layoutItem.y + layoutItem.h < top || layoutItem.y > bottom) {
        continue;
      }

      visibleItems.push(layoutItem);
      this.drawItem(layoutItem);
    }

    this.ctx.restore();

    // Trigger lazy loading for visible items and unloading for invisible ones
    this.loadVisibleImages(visibleItems);
  }

  drawEmptyState(w, h) {
    this.ctx.fillStyle = '#8a8f9f';
    this.ctx.font = '500 14px "Outfit", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('No folder assigned to this canvas.', w / 2, h / 2);
  }

  drawItem(layoutItem) {
    let item = layoutItem.item;
    let x = layoutItem.x;
    let y = layoutItem.y;
    let w = layoutItem.w;
    let h = layoutItem.h;

    // Draw background placeholder
    this.ctx.fillStyle = '#1b1e29';
    this.ctx.fillRect(x, y, w, h);

    if (item.imageObj && item.imageObj.complete) {
      this.ctx.drawImage(item.imageObj, x, y, w, h);
    } else {
      // Draw placeholder text/spinner
      this.ctx.fillStyle = '#8a8f9f';
      this.ctx.font = '10px "Outfit", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Loading...', x + w / 2, y + h / 2);
    }

    // Border highlight based on metadata prediction
    let hasMeta = item.metadata;
    let isCorrect = true;
    let hasPrediction = false;

    if (hasMeta) {
      let m = item.metadata;
      // Common metadata property names
      let pred = m.prediction !== undefined ? m.prediction : m.pred;
      let label = m.label !== undefined ? m.label : (m.ground_truth !== undefined ? m.ground_truth : m.gt);
      
      if (pred !== undefined && label !== undefined) {
        hasPrediction = true;
        isCorrect = String(pred) === String(label);
      }
    }

    // Draw outline border
    if (hasPrediction) {
      this.ctx.strokeStyle = isCorrect ? '#10b981' : '#f43f5e';
      this.ctx.lineWidth = 1.5 / this.scale; // Keep border line width constant on screen
      this.ctx.strokeRect(x, y, w, h);
    } else {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      this.ctx.lineWidth = 1.0 / this.scale;
      this.ctx.strokeRect(x, y, w, h);
    }

    // Hover overlay border
    if (this.hoveredItem === layoutItem) {
      this.ctx.strokeStyle = '#4f46e5';
      this.ctx.lineWidth = 3.0 / this.scale;
      this.ctx.strokeRect(x, y, w, h);
    }

    // Label Overlay (only if zoom is high enough to see clearly)
    if (this.scale > 0.4) {
      this.ctx.fillStyle = 'rgba(10, 11, 14, 0.7)';
      let labelH = Math.min(18 / this.scale, h * 0.25);
      this.ctx.fillRect(x, y + h - labelH, w, labelH);

      this.ctx.fillStyle = '#f1f3f6';
      let fontSize = Math.max(8, Math.min(10 / this.scale, 11));
      this.ctx.font = `600 ${fontSize}px "Outfit", sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      
      let text = item.name;
      if (hasMeta && item.metadata.confidence !== undefined) {
        text += ` (${Number(item.metadata.confidence).toFixed(2)})`;
      }
      
      // Truncate text if it overflows width
      let maxTextW = w - 8 / this.scale;
      let textW = this.ctx.measureText(text).width;
      if (textW > maxTextW) {
        // Simple truncation
        text = text.substring(0, Math.floor(text.length * (maxTextW / textW))) + '...';
      }

      this.ctx.fillText(text, x + 4 / this.scale, y + h - labelH / 2);
    }
  }

  /**
   * Lazily loads image blobs and creates Image objects for items currently in view
   */
  loadVisibleImages(visibleLayoutItems) {
    for (let layoutItem of visibleLayoutItems) {
      let item = layoutItem.item;
      if (item.imageObj || this.loadingItems.has(item.fullPath)) continue;

      this.loadingItems.add(item.fullPath);

      this.zipHandler.getBlobUrl(item).then((blobUrl) => {
        let img = new Image();
        img.onload = () => {
          item.imageObj = img;
          this.loadingItems.delete(item.fullPath);
          // Redraw canvas once image is loaded
          this.draw();
        };
        img.onerror = () => {
          this.loadingItems.delete(item.fullPath);
        };
        img.src = blobUrl;
      }).catch(err => {
        console.error(`Failed to load image blob: ${item.fullPath}`, err);
        this.loadingItems.delete(item.fullPath);
      });
    }
  }

  /**
   * Revokes URL objects and nulls Image objects for items far outside the current view
   */
  manageMemory() {
    let containerW = this.canvas.width / window.devicePixelRatio;
    let containerH = this.canvas.height / window.devicePixelRatio;

    // Viewport bounds in world coords
    let left = -this.offsetX / this.scale;
    let top = -this.offsetY / this.scale;
    let right = (containerW - this.offsetX) / this.scale;
    let bottom = (containerH - this.offsetY) / this.scale;

    // Safety margin: 2.0x screen width/height around viewport
    let marginX = (right - left) * 1.5;
    let marginY = (bottom - top) * 1.5;
    
    let activeLeft = left - marginX;
    let activeRight = right + marginX;
    let activeTop = top - marginY;
    let activeBottom = bottom + marginY;

    for (let layoutItem of this.layout.items) {
      let item = layoutItem.item;
      if (!item.blobUrl && !item.imageObj) continue;

      // If outside the active margin boundary, unload from memory
      if (layoutItem.x + layoutItem.w < activeLeft || layoutItem.x > activeRight ||
          layoutItem.y + layoutItem.h < activeTop || layoutItem.y > activeBottom) {
        this.zipHandler.revokeBlobUrl(item);
      }
    }
  }

  /**
   * Unloads all loaded images in this engine
   */
  clear() {
    for (let layoutItem of this.layout.items) {
      this.zipHandler.revokeBlobUrl(layoutItem.item);
    }
    this.layout = { items: [], width: 0, height: 0 };
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hoveredItem = null;
    this.loadingItems.clear();
    this.draw();
  }
}
