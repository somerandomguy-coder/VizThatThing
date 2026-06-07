// Sidebar Dashboard rendering and filter controls

/**
 * Draws the interactive confidence distribution histogram on a canvas.
 * @param {HTMLCanvasElement} canvasEl - The histogram canvas
 * @param {Array<number>} values - Array of confidence values
 * @param {number} minVal - Minimum threshold (0.0 to 1.0)
 * @param {number} maxVal - Maximum threshold (0.0 to 1.0)
 */
export function drawHistogram(canvasEl, values, minVal = 0, maxVal = 1) {
  let ctx = canvasEl.getContext('2d');
  
  // Set dimensions based on device pixel ratio for sharp rendering
  let rect = canvasEl.getBoundingClientRect();
  canvasEl.width = rect.width * window.devicePixelRatio;
  canvasEl.height = rect.height * window.devicePixelRatio;
  
  let w = canvasEl.width;
  let h = canvasEl.height;
  
  ctx.save();
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  let drawW = w / window.devicePixelRatio;
  let drawH = h / window.devicePixelRatio;
  
  ctx.clearRect(0, 0, drawW, drawH);

  if (!values || values.length === 0) {
    ctx.fillStyle = '#8a8f9f';
    ctx.font = '500 11px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No confidence metadata found', drawW / 2, drawH / 2);
    ctx.restore();
    return;
  }

  // Bin values into 20 brackets
  let numBins = 20;
  let bins = new Array(numBins).fill(0);
  for (let val of values) {
    let binIdx = Math.floor(val * numBins);
    if (binIdx >= numBins) binIdx = numBins - 1;
    if (binIdx < 0) binIdx = 0;
    bins[binIdx]++;
  }

  let maxBin = Math.max(...bins);
  if (maxBin === 0) maxBin = 1;

  let binW = drawW / numBins;
  let paddingH = 16;
  
  for (let i = 0; i < numBins; i++) {
    let binVal = i / numBins;
    let binCount = bins[i];
    let barH = (binCount / maxBin) * (drawH - paddingH - 8);
    
    // Check if bin falls in the range selected by the user
    let inRange = binVal >= minVal && (binVal + 1 / numBins) <= maxVal;
    
    ctx.fillStyle = inRange ? '#4f46e5' : '#1b1e29';
    ctx.fillRect(i * binW + 1, drawH - barH - paddingH, binW - 2, barH);
  }

  // Draw axis indicators
  ctx.fillStyle = '#8a8f9f';
  ctx.font = '600 9px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('0.0', 2, drawH - 4);
  ctx.textAlign = 'center';
  ctx.fillText('0.5', drawW / 2, drawH - 4);
  ctx.textAlign = 'right';
  ctx.fillText('1.0', drawW - 2, drawH - 4);
  ctx.restore();
}

/**
 * Renders the folder structure as an interactive tree sidebar
 * @param {object} rootNode - Reconstructed directory root node
 * @param {HTMLElement} containerEl - Container div to inject HTML nodes into
 * @param {Function} onAssign - Callback function when folder is assigned to Canvas A/B
 */
export function renderFolderTree(rootNode, containerEl, onAssign) {
  containerEl.innerHTML = '';

  function buildNodeHtml(treeNode, depth) {
    let wrapper = document.createElement('div');
    wrapper.className = 'folder-tree-node';
    wrapper.style.marginLeft = `${depth * 10}px`;

    let item = document.createElement('div');
    item.className = 'folder-item';

    let nameContainer = document.createElement('div');
    nameContainer.className = 'folder-name-container';

    let icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.innerHTML = '📁';

    let nameLabel = document.createElement('span');
    nameLabel.textContent = treeNode.name;
    nameLabel.style.fontWeight = '500';

    nameContainer.appendChild(icon);
    nameContainer.appendChild(nameLabel);

    let rightContainer = document.createElement('div');
    rightContainer.className = 'folder-name-container';
    rightContainer.style.gap = '6px';

    let countBadge = document.createElement('span');
    countBadge.className = 'folder-count';
    countBadge.textContent = treeNode.totalCount;

    let assignBtns = document.createElement('div');
    assignBtns.className = 'folder-assign-btns';

    let btnA = document.createElement('button');
    btnA.className = 'btn-mini';
    btnA.textContent = 'A';
    btnA.title = 'Assign to Canvas A (Left)';
    btnA.addEventListener('click', (e) => {
      e.stopPropagation();
      onAssign(treeNode.path, 'A');
      setActiveFolderStyle(item);
    });

    let btnB = document.createElement('button');
    btnB.className = 'btn-mini';
    btnB.textContent = 'B';
    btnB.title = 'Assign to Canvas B (Right)';
    btnB.addEventListener('click', (e) => {
      e.stopPropagation();
      onAssign(treeNode.path, 'B');
      setActiveFolderStyle(item);
    });

    assignBtns.appendChild(btnA);
    assignBtns.appendChild(btnB);
    rightContainer.appendChild(countBadge);
    rightContainer.appendChild(assignBtns);

    item.appendChild(nameContainer);
    item.appendChild(rightContainer);
    wrapper.appendChild(item);

    // Recursively render child folders
    for (let childName of Object.keys(treeNode.children)) {
      let childNode = treeNode.children[childName];
      if (childNode.totalCount > 0) {
        let childHtml = buildNodeHtml(childNode, depth + 1);
        wrapper.appendChild(childHtml);
      }
    }

    return wrapper;
  }

  function setActiveFolderStyle(itemEl) {
    // Basic interactive click marker style
    let allItems = containerEl.querySelectorAll('.folder-item');
    allItems.forEach(i => i.style.background = '');
    itemEl.style.background = 'rgba(79, 70, 229, 0.1)';
  }

  // 1. Create a root entry first for entire ZIP mapping
  if (rootNode.totalCount > 0) {
    let rootItem = document.createElement('div');
    rootItem.className = 'folder-item';
    rootItem.style.borderLeft = '2.5px solid var(--accent-blue)';
    
    let nameContainer = document.createElement('div');
    nameContainer.className = 'folder-name-container';
    nameContainer.innerHTML = `<span class="folder-icon">📂</span> <span style="font-weight:600">All Images [Root]</span>`;
    
    let rightContainer = document.createElement('div');
    rightContainer.className = 'folder-name-container';
    rightContainer.style.gap = '6px';
    
    let countBadge = document.createElement('span');
    countBadge.className = 'folder-count';
    countBadge.textContent = rootNode.totalCount;
    
    let assignBtns = document.createElement('div');
    assignBtns.className = 'folder-assign-btns';
    
    let btnA = document.createElement('button');
    btnA.className = 'btn-mini';
    btnA.textContent = 'A';
    btnA.addEventListener('click', (e) => {
      e.stopPropagation();
      onAssign('root', 'A');
      setActiveFolderStyle(rootItem);
    });
    
    let btnB = document.createElement('button');
    btnB.className = 'btn-mini';
    btnB.textContent = 'B';
    btnB.addEventListener('click', (e) => {
      e.stopPropagation();
      onAssign('root', 'B');
      setActiveFolderStyle(rootItem);
    });
    
    assignBtns.appendChild(btnA);
    assignBtns.appendChild(btnB);
    rightContainer.appendChild(countBadge);
    rightContainer.appendChild(assignBtns);
    
    rootItem.appendChild(nameContainer);
    rootItem.appendChild(rightContainer);
    containerEl.appendChild(rootItem);
  }

  // 2. Render children nodes recursively
  for (let childName of Object.keys(rootNode.children)) {
    let childNode = rootNode.children[childName];
    if (childNode.totalCount > 0) {
      containerEl.appendChild(buildNodeHtml(childNode, 0));
    }
  }
}

/**
 * Calculates metrics (accuracy, accuracy counts) for a list of images
 * @param {Array} images - List of image items
 * @returns {object} Calculated metrics object
 */
export function calculateMetrics(images) {
  let total = images.length;
  let correctCount = 0;
  let incorrectCount = 0;
  let hasLabelPredCount = 0;
  let sumConfidence = 0;
  let hasConfidenceCount = 0;
  
  let confidences = [];

  for (let img of images) {
    if (img.metadata) {
      let m = img.metadata;
      
      // Parse confidence
      if (m.confidence !== undefined) {
        let conf = Number(m.confidence);
        if (!isNaN(conf)) {
          sumConfidence += conf;
          hasConfidenceCount++;
          confidences.push(conf);
        }
      }

      // Check correctness
      let pred = m.prediction !== undefined ? m.prediction : m.pred;
      let label = m.label !== undefined ? m.label : (m.ground_truth !== undefined ? m.ground_truth : m.gt);
      
      if (pred !== undefined && label !== undefined) {
        hasLabelPredCount++;
        if (String(pred) === String(label)) {
          correctCount++;
        } else {
          incorrectCount++;
        }
      }
    }
  }

  let accuracy = hasLabelPredCount > 0 ? (correctCount / hasLabelPredCount) * 100 : null;
  let avgConfidence = hasConfidenceCount > 0 ? (sumConfidence / hasConfidenceCount) : null;

  return {
    total,
    correctCount,
    incorrectCount,
    hasLabels: hasLabelPredCount > 0,
    accuracy,
    avgConfidence,
    confidences
  };
}
