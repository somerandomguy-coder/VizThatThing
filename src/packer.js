// Growing 2D Bin Packer and Justified Grid layout solvers

export class GrowingPacker {
  constructor() {
    this.root = null;
  }

  fit(blocks) {
    let len = blocks.length;
    let w = len > 0 ? blocks[0].w : 0;
    let h = len > 0 ? blocks[0].h : 0;
    this.root = { x: 0, y: 0, w: w, h: h };
    
    for (let n = 0; n < len; n++) {
      let block = blocks[n];
      let node = this.findNode(this.root, block.w, block.h);
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
    } else if ((w <= root.w) && (h <= root.h)) {
      return root;
    }
    return null;
  }

  splitNode(node, w, h) {
    node.used = true;
    node.down = { x: node.x, y: node.y + h, w: node.w, h: node.h - h };
    node.right = { x: node.x + w, y: node.y, w: node.w - w, h: h };
    return node;
  }

  growNode(w, h) {
    let canGrowDown = (w <= this.root.w);
    let canGrowRight = (h <= this.root.h);

    // Try to keep the layout square-ish
    let shouldGrowRight = canGrowRight && (this.root.h >= this.root.w);
    let shouldGrowDown = canGrowDown && (this.root.w >= this.root.h);

    if (shouldGrowRight) {
      return this.growRight(w, h);
    } else if (shouldGrowDown) {
      return this.growDown(w, h);
    } else if (canGrowRight) {
      return this.growRight(w, h);
    } else if (canGrowDown) {
      return this.growDown(w, h);
    }
    return null; // Should not happen if root size > 0
  }

  growRight(w, h) {
    this.root = {
      used: true,
      x: 0,
      y: 0,
      w: this.root.w + w,
      h: this.root.h,
      down: this.root,
      right: { x: this.root.w, y: 0, w: w, h: this.root.h }
    };
    let node = this.findNode(this.root, w, h);
    if (node) {
      return this.splitNode(node, w, h);
    }
    return null;
  }

  growDown(w, h) {
    this.root = {
      used: true,
      x: 0,
      y: 0,
      w: this.root.w,
      h: this.root.h + h,
      down: { x: 0, y: this.root.h, w: this.root.w, h: h },
      right: this.root
    };
    let node = this.findNode(this.root, w, h);
    if (node) {
      return this.splitNode(node, w, h);
    }
    return null;
  }
}

/**
 * Computes 2D Bin Packing layout.
 * @param {Array} items - Array of image structures with width and height
 * @param {number} baseSize - Maximum side length for image scaling
 * @param {number} gap - Gap size in pixels
 */
export function packLayout(items, baseSize, gap) {
  if (items.length === 0) return { items: [], width: 0, height: 0 };

  // Prepare blocks with scaled dimensions
  let blocks = items.map((item, idx) => {
    let aspect = item.width / item.height;
    let w, h;
    if (item.width > item.height) {
      w = baseSize;
      h = Math.round(baseSize / aspect);
    } else {
      h = baseSize;
      w = Math.round(baseSize * aspect);
    }
    
    // We add the gap to the block dimensions for packing calculations,
    // then subtract it when positioning.
    return {
      index: idx,
      item: item,
      w: w + gap,
      h: h + gap,
      origW: w,
      origH: h
    };
  });

  // Sort blocks by max dimension descending for tighter packing
  blocks.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  let packer = new GrowingPacker();
  packer.fit(blocks);

  let layoutItems = [];
  for (let block of blocks) {
    if (block.fit) {
      layoutItems.push({
        item: block.item,
        x: block.fit.x,
        y: block.fit.y,
        w: block.origW,
        h: block.origH
      });
    }
  }

  return {
    items: layoutItems,
    width: packer.root ? packer.root.w - gap : 0,
    height: packer.root ? packer.root.h - gap : 0
  };
}

/**
 * Computes Justified Row layout.
 * @param {Array} items - Array of image structures with width and height
 * @param {number} containerWidth - Canvas element width
 * @param {number} targetRowHeight - Preferred row height
 * @param {number} gap - Gap size in pixels
 */
export function justifyLayout(items, containerWidth, targetRowHeight, gap) {
  if (items.length === 0) return { items: [], width: 0, height: 0 };
  
  let row = [];
  let rowWidth = 0;
  let layoutItems = [];
  let y = 0;

  for (let i = 0; i < items.length; i++) {
    let item = items[i];
    let aspect = item.width / item.height;
    let w = targetRowHeight * aspect;
    row.push({ item, aspect, w });
    rowWidth += w;

    let gapsCount = row.length - 1;
    let totalRowWidthWithGaps = rowWidth + gapsCount * gap;

    // Check if row is full or if it's the last item
    if (totalRowWidthWithGaps >= containerWidth - gap || i === items.length - 1) {
      let shouldStretch = true;
      // If it's the last item and the row is mostly empty, don't stretch it excessively
      if (i === items.length - 1 && totalRowWidthWithGaps < containerWidth * 0.7) {
        shouldStretch = false;
      }

      let rowHeight = targetRowHeight;
      if (shouldStretch) {
        let sumAspect = row.reduce((sum, r) => sum + r.aspect, 0);
        if (sumAspect > 0) {
          rowHeight = (containerWidth - gapsCount * gap) / sumAspect;
        }
      }

      let x = 0;
      for (let r of row) {
        let finalWidth = rowHeight * r.aspect;
        layoutItems.push({
          item: r.item,
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(finalWidth),
          h: Math.round(rowHeight)
        });
        x += finalWidth + gap;
      }

      y += rowHeight + gap;
      row = [];
      rowWidth = 0;
    }
  }

  return {
    items: layoutItems,
    width: containerWidth,
    height: y > 0 ? y - gap : 0
  };
}
