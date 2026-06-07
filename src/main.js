import './style.css';
import { ZipHandler } from './zip-handler.js';
import { CanvasEngine } from './canvas-engine.js';
import { packLayout, justifyLayout } from './packer.js';
import { drawHistogram, renderFolderTree, calculateMetrics } from './dashboard.js';

// 1. App State
const state = {
  zipHandler: new ZipHandler(),
  
  // Viewport Engines
  engineA: null,
  engineB: null,
  
  // Active folder paths assigned to each viewport
  activeFolderA: '',
  activeFolderB: '',
  
  // Currently displayed page (1-indexed)
  pageA: 1,
  pageB: 1,
  pageSize: 500,

  // Lists of filtered images
  filteredImagesA: [],
  filteredImagesB: [],

  // Global Configs
  layoutMode: 'binpacking', // 'binpacking' | 'justified'
  thumbSize: 200,
  gapSize: 4,
  isLinked: false,
  
  // Filters
  searchQuery: '',
  minConfidence: 0.0,
  maxConfidence: 1.0
};

// 2. Query DOM Elements
const els = {
  dropOverlay: document.getElementById('drop-overlay'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadMsg: document.getElementById('load-msg'),
  loadSubmsg: document.getElementById('load-submsg'),
  emptyCover: document.getElementById('viewport-empty-cover'),
  
  btnUpload: document.getElementById('btn-upload-file'),
  fileInput: document.getElementById('file-input'),
  btnClear: document.getElementById('btn-clear-all'),
  btnToggleLayout: document.getElementById('btn-toggle-layout'),
  btnLinkViewports: document.getElementById('btn-link-viewports'),
  
  // Metadata Sidebar Controls
  statTotal: document.getElementById('stat-total'),
  statAccuracy: document.getElementById('stat-accuracy'),
  statCorrect: document.getElementById('stat-correct'),
  statIncorrect: document.getElementById('stat-incorrect'),
  
  searchInput: document.getElementById('search-input'),
  confidenceFilterGroup: document.getElementById('confidence-filter-group'),
  confidenceHist: document.getElementById('confidence-histogram'),
  confidenceMinInput: document.getElementById('confidence-min'),
  confidenceMaxInput: document.getElementById('confidence-max'),
  confidenceRangeLabel: document.getElementById('confidence-range-label'),
  
  folderTreeContainer: document.getElementById('folder-tree-container'),
  
  // Layout Controls
  sliderThumbSize: document.getElementById('slider-thumb-size'),
  lblThumbSize: document.getElementById('lbl-thumb-size'),
  sliderGapSize: document.getElementById('slider-gap-size'),
  lblGapSize: document.getElementById('lbl-gap-size'),
  
  // Panel Info
  titlePathA: document.getElementById('title-path-a'),
  infoCountA: document.getElementById('info-count-a'),
  titlePathB: document.getElementById('title-path-b'),
  infoCountB: document.getElementById('info-count-b'),
  
  // Pagination HUDs
  btnPrevA: document.getElementById('btn-prev-page-a'),
  btnNextA: document.getElementById('btn-next-page-a'),
  lblPageA: document.getElementById('lbl-page-a'),
  
  btnPrevB: document.getElementById('btn-prev-page-b'),
  btnNextB: document.getElementById('btn-next-page-b'),
  lblPageB: document.getElementById('lbl-page-b'),
  
  // Hover Inspect Card
  hoverCard: document.getElementById('hover-card'),
  hcName: document.getElementById('hc-name'),
  hcPath: document.getElementById('hc-path'),
  hcMeta: document.getElementById('hc-meta'),

  // Modal Details
  detailsModal: document.getElementById('details-modal'),
  modalImage: document.getElementById('modal-image'),
  modalFilename: document.getElementById('modal-filename'),
  modalFilepath: document.getElementById('modal-filepath'),
  modalMetaList: document.getElementById('modal-meta-list'),
  modalClose: document.getElementById('modal-close')
};

// 3. Initialize App
function init() {
  // Setup Canvases
  const canvasA = document.getElementById('canvas-a');
  const canvasB = document.getElementById('canvas-b');
  
  state.engineA = new CanvasEngine(canvasA, state.zipHandler);
  state.engineB = new CanvasEngine(canvasB, state.zipHandler);
  
  state.engineA.setPeerEngine(state.engineB, state.isLinked);
  state.engineB.setPeerEngine(state.engineA, state.isLinked);

  setupEventListeners();
  handleResize();
}

// 4. Setup DOM & Canvas Event Listeners
function setupEventListeners() {
  window.addEventListener('resize', handleResize);

  // File Upload Elements
  els.btnUpload.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleZipFile(e.target.files[0]);
    }
  });

  // Drag and Drop handlers
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    els.dropOverlay.classList.add('dragover');
  });

  els.dropOverlay.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  els.dropOverlay.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove class if dragging leaves the full drop screen bounds
    if (e.relatedTarget === null) {
      els.dropOverlay.classList.remove('dragover');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropOverlay.classList.remove('dragover');
    
    let files = e.dataTransfer.files;
    if (files.length > 0) {
      // Find the first zip file
      let zipFile = Array.from(files).find(f => f.name.endsWith('.zip'));
      if (zipFile) {
        handleZipFile(zipFile);
      } else {
        alert('Please drop a valid .zip archive.');
      }
    }
  });

  // Global action buttons
  els.btnClear.addEventListener('click', clearDataset);

  els.btnToggleLayout.addEventListener('click', () => {
    if (state.layoutMode === 'binpacking') {
      state.layoutMode = 'justified';
      els.btnToggleLayout.innerHTML = '<span>📖</span> Justified Grid';
    } else {
      state.layoutMode = 'binpacking';
      els.btnToggleLayout.innerHTML = '<span>📦</span> Bin Packing';
    }
    updateLayouts();
  });

  els.btnLinkViewports.addEventListener('click', () => {
    state.isLinked = !state.isLinked;
    if (state.isLinked) {
      els.btnLinkViewports.classList.add('active');
    } else {
      els.btnLinkViewports.classList.remove('active');
    }
    state.engineA.setLinked(state.isLinked);
    state.engineB.setLinked(state.isLinked);
  });

  // Layout Configuration Sliders
  els.sliderThumbSize.addEventListener('input', (e) => {
    state.thumbSize = parseInt(e.target.value);
    els.lblThumbSize.textContent = `${state.thumbSize}px`;
    updateLayouts();
  });

  els.sliderGapSize.addEventListener('input', (e) => {
    state.gapSize = parseInt(e.target.value);
    els.lblGapSize.textContent = `${state.gapSize}px`;
    updateLayouts();
  });

  // Filters & Search Inputs
  els.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    handleFiltersChange();
  });

  els.confidenceMinInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.minConfidence = Math.max(0, Math.min(1, val));
      els.confidenceRangeLabel.textContent = `${state.minConfidence.toFixed(2)} - ${state.maxConfidence.toFixed(2)}`;
      handleFiltersChange();
    }
  });

  els.confidenceMaxInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.maxConfidence = Math.max(0, Math.min(1, val));
      els.confidenceRangeLabel.textContent = `${state.minConfidence.toFixed(2)} - ${state.maxConfidence.toFixed(2)}`;
      handleFiltersChange();
    }
  });

  // Pagination Controls
  els.btnPrevA.addEventListener('click', () => changePage('A', -1));
  els.btnNextA.addEventListener('click', () => changePage('A', 1));
  
  els.btnPrevB.addEventListener('click', () => changePage('B', -1));
  els.btnNextB.addEventListener('click', () => changePage('B', 1));

  // Connect Inspector callbacks to canvas engines
  state.engineA.onHoverChange = (item, x, y) => handleInspectHover(item, x, y);
  state.engineB.onHoverChange = (item, x, y) => handleInspectHover(item, x, y);
  
  state.engineA.onItemClick = (item) => openImageDetails(item.item);
  state.engineB.onItemClick = (item) => openImageDetails(item.item);

  // Close Modal Events
  els.modalClose.addEventListener('click', closeImageDetails);
  els.detailsModal.addEventListener('click', (e) => {
    if (e.target === els.detailsModal) closeImageDetails();
  });
}

function handleResize() {
  state.engineA.resize();
  state.engineB.resize();
}

// 5. ZIP Decompression Pipeline
async function handleZipFile(file) {
  showLoading('Reading ZIP file...', 'Reading ZIP archive headers...');

  try {
    let tree = await state.zipHandler.loadZip(file, (progress) => {
      let percentStr = progress.percent !== undefined ? ` (${progress.percent}%)` : '';
      updateLoadingMsg(progress.message, `Process: ${progress.status}${percentStr}`);
    });

    hideLoading();
    els.emptyCover.style.display = 'none';
    els.btnClear.disabled = false;

    // Set default folders: load root in Canvas A
    state.activeFolderA = 'root';
    state.activeFolderB = '';
    
    // Reset pages
    state.pageA = 1;
    state.pageB = 1;

    // Render folder explorer
    renderFolderTree(tree, els.folderTreeContainer, assignFolderToCanvas);

    // Initial statistics and confidence distribution
    updateGlobalDashboard();
    
    // Assign Canvas A to root directory images
    await loadFolderIntoCanvas('root', 'A');

  } catch (err) {
    hideLoading();
    alert(`Error: ${err.message}`);
    console.error(err);
  }
}

// 6. Sidebar Dashboard and Stats Updating
function updateGlobalDashboard() {
  let stats = calculateMetrics(state.zipHandler.images);
  
  els.statTotal.textContent = stats.total.toLocaleString();
  
  if (stats.hasLabels) {
    els.statAccuracy.textContent = `${stats.accuracy.toFixed(1)}%`;
    els.statCorrect.textContent = stats.correctCount.toLocaleString();
    els.statIncorrect.textContent = stats.incorrectCount.toLocaleString();
  } else {
    els.statAccuracy.textContent = 'N/A';
    els.statCorrect.textContent = 'N/A';
    els.statIncorrect.textContent = 'N/A';
  }

  // Draw confidence scores histogram
  if (stats.confidences.length > 0) {
    els.confidenceFilterGroup.style.display = 'block';
    drawHistogram(els.confidenceHist, stats.confidences, state.minConfidence, state.maxConfidence);
  } else {
    els.confidenceFilterGroup.style.display = 'none';
  }
}

// 7. Folder Viewer Pipeline
async function assignFolderToCanvas(folderPath, canvasId) {
  showLoading('Loading folder...', `Fetching and scaling images for Canvas ${canvasId}...`);
  try {
    await loadFolderIntoCanvas(folderPath, canvasId);
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

async function loadFolderIntoCanvas(folderPath, canvasId) {
  let rawImages = state.zipHandler.getImagesInFolder(folderPath);

  if (canvasId === 'A') {
    state.activeFolderA = folderPath;
    state.pageA = 1;
    els.titlePathA.textContent = folderPath === 'root' ? 'All Images' : folderPath;
    applyFiltersAndLayout('A');
  } else {
    state.activeFolderB = folderPath;
    state.pageB = 1;
    els.titlePathB.textContent = folderPath === 'root' ? 'All Images' : folderPath;
    applyFiltersAndLayout('B');
  }
}

// 8. Filters & Layout Solvers
function handleFiltersChange() {
  // Re-run filter operations for active channels
  if (state.activeFolderA !== '') {
    applyFiltersAndLayout('A');
  }
  if (state.activeFolderB !== '') {
    applyFiltersAndLayout('B');
  }

  // Highlight range on the histogram
  let stats = calculateMetrics(state.zipHandler.images);
  if (stats.confidences.length > 0) {
    drawHistogram(els.confidenceHist, stats.confidences, state.minConfidence, state.maxConfidence);
  }
  
  // Re-calculate the metrics on the filtered subset of files active on screen
  let activeImages = [];
  if (state.activeFolderA !== '') activeImages.push(...state.filteredImagesA);
  // Add canvas B images if it is assigned and visible
  if (state.activeFolderB !== '' && state.activeFolderB !== state.activeFolderA) {
    activeImages.push(...state.filteredImagesB);
  }
  if (activeImages.length > 0) {
    let subsetStats = calculateMetrics(activeImages);
    if (subsetStats.hasLabels) {
      els.statAccuracy.textContent = `${subsetStats.accuracy.toFixed(1)}%`;
      els.statCorrect.textContent = subsetStats.correctCount.toLocaleString();
      els.statIncorrect.textContent = subsetStats.incorrectCount.toLocaleString();
    }
  }
}

function applyFilters(images) {
  let minConf = state.minConfidence;
  let maxConf = state.maxConfidence;
  let query = state.searchQuery.toLowerCase().trim();

  return images.filter(img => {
    // 1. Confidence range filter
    if (img.metadata && img.metadata.confidence !== undefined) {
      let conf = Number(img.metadata.confidence);
      if (!isNaN(conf) && (conf < minConf || conf > maxConf)) {
        return false;
      }
    }

    // 2. Filename or metadata text search
    if (query) {
      let nameMatch = img.name.toLowerCase().includes(query) || img.fullPath.toLowerCase().includes(query);
      let metaMatch = false;
      if (img.metadata) {
        for (let val of Object.values(img.metadata)) {
          if (String(val).toLowerCase().includes(query)) {
            metaMatch = true;
            break;
          }
        }
      }
      return nameMatch || metaMatch;
    }

    return true;
  });
}

async function applyFiltersAndLayout(canvasId) {
  let rawImages = state.zipHandler.getImagesInFolder(canvasId === 'A' ? state.activeFolderA : state.activeFolderB);
  let filtered = applyFilters(rawImages);
  
  if (canvasId === 'A') {
    state.filteredImagesA = filtered;
    els.infoCountA.textContent = `${filtered.length} images`;
    await renderCanvasPage('A');
  } else {
    state.filteredImagesB = filtered;
    els.infoCountB.textContent = `${filtered.length} images`;
    await renderCanvasPage('B');
  }
}

async function renderCanvasPage(canvasId) {
  let images = canvasId === 'A' ? state.filteredImagesA : state.filteredImagesB;
  let page = canvasId === 'A' ? state.pageA : state.pageB;
  let engine = canvasId === 'A' ? state.engineA : state.engineB;

  let totalPages = Math.max(1, Math.ceil(images.length / state.pageSize));
  
  // Cap page boundaries
  if (page > totalPages) {
    if (canvasId === 'A') state.pageA = totalPages;
    else state.pageB = totalPages;
    page = totalPages;
  }

  // Update UI Pagination indicators
  if (canvasId === 'A') {
    els.lblPageA.textContent = `Page ${page} / ${totalPages}`;
    els.btnPrevA.disabled = page === 1;
    els.btnNextA.disabled = page === totalPages;
  } else {
    els.lblPageB.textContent = `Page ${page} / ${totalPages}`;
    els.btnPrevB.disabled = page === 1;
    els.btnNextB.disabled = page === totalPages;
  }

  // Get active page slice (max 500 images)
  let startIndex = (page - 1) * state.pageSize;
  let pageSlice = images.slice(startIndex, startIndex + state.pageSize);

  if (pageSlice.length === 0) {
    engine.clear();
    return;
  }

  // Ensure all sizes/aspect ratios in this slice are loaded client-side
  // We show a fast progress update in the sidebar if needed
  await state.zipHandler.loadBatchDimensions(pageSlice);

  // Compute Layout coordinates
  let containerW = engine.canvas.width / window.devicePixelRatio;
  let layout;
  
  if (state.layoutMode === 'binpacking') {
    layout = packLayout(pageSlice, state.thumbSize, state.gapSize);
  } else {
    layout = justifyLayout(pageSlice, containerW, state.thumbSize * 0.75, state.gapSize);
  }

  engine.setLayout(layout);
}

function updateLayouts() {
  if (state.activeFolderA !== '') {
    renderCanvasPage('A');
  }
  if (state.activeFolderB !== '') {
    renderCanvasPage('B');
  }
}

function changePage(canvasId, direction) {
  if (canvasId === 'A') {
    state.pageA += direction;
    renderCanvasPage('A');
  } else {
    state.pageB += direction;
    renderCanvasPage('B');
  }
}

// 9. Hover Detail Inspector Card Overlay
function handleInspectHover(hoveredItem, screenX, screenY) {
  if (!hoveredItem || !hoveredItem.item) {
    els.hoverCard.style.display = 'none';
    return;
  }

  let item = hoveredItem.item;
  
  // Fill details
  els.hcName.textContent = item.name;
  els.hcPath.textContent = item.fullPath;
  
  // Clear and populate metadata rows
  els.hcMeta.innerHTML = `
    <div class="hover-meta-row">
      <span class="hover-meta-label">Resolution</span>
      <span class="hover-meta-val">${item.width} x ${item.height}</span>
    </div>
  `;

  let borderClass = 'border-default';

  if (item.metadata) {
    let m = item.metadata;
    let pred = m.prediction !== undefined ? m.prediction : m.pred;
    let label = m.label !== undefined ? m.label : (m.ground_truth !== undefined ? m.ground_truth : m.gt);
    
    if (pred !== undefined && label !== undefined) {
      let correct = String(pred) === String(label);
      borderClass = correct ? 'border-correct' : 'border-incorrect';
      
      els.hcMeta.innerHTML += `
        <div class="hover-meta-row" style="margin-top: 4px;">
          <span class="hover-meta-label">Prediction</span>
          <span class="badge-pill ${correct ? 'success' : 'danger'}">${pred}</span>
        </div>
        <div class="hover-meta-row">
          <span class="hover-meta-label">Ground Truth</span>
          <span class="hover-meta-val">${label}</span>
        </div>
      `;
    } else {
      // If there are other properties, render them
      for (let [k, v] of Object.entries(m)) {
        if (k.toLowerCase() === 'confidence' || k.toLowerCase() === 'loss' || k.toLowerCase() === 'score') {
          let numVal = Number(v);
          v = !isNaN(numVal) ? numVal.toFixed(4) : v;
        }
        
        // Prevent displaying object structures directly
        if (typeof v !== 'object') {
          els.hcMeta.innerHTML += `
            <div class="hover-meta-row">
              <span class="hover-meta-label">${k}</span>
              <span class="hover-meta-val">${v}</span>
            </div>
          `;
        }
      }
    }
    
    // Add confidence if parsed independently
    if (m.confidence !== undefined && pred === undefined) {
      els.hcMeta.innerHTML += `
        <div class="hover-meta-row">
          <span class="hover-meta-label">Confidence</span>
          <span class="hover-meta-val">${Number(m.confidence).toFixed(4)}</span>
        </div>
      `;
    }
  }

  // Update classes
  els.hoverCard.className = `glass ${borderClass}`;
  
  // Position Hover card
  els.hoverCard.style.display = 'flex';
  
  let cardW = els.hoverCard.offsetWidth || 280;
  let cardH = els.hoverCard.offsetHeight || 150;
  let pad = 20;

  let x = screenX + pad;
  let y = screenY + pad;

  // Screen collision checks
  if (x + cardW > window.innerWidth) {
    x = screenX - cardW - pad;
  }
  if (y + cardH > window.innerHeight) {
    y = window.innerHeight - cardH - pad;
  }

  els.hoverCard.style.left = `${x}px`;
  els.hoverCard.style.top = `${y}px`;
}

// 10. Detailed View Image Modal
async function openImageDetails(item) {
  showLoading('Loading high-res image...', 'Decompressing ZIP entry...');
  
  try {
    let url = await state.zipHandler.getBlobUrl(item);
    els.modalImage.src = url;
    els.modalFilename.textContent = item.name;
    els.modalFilepath.textContent = item.fullPath;
    
    els.modalMetaList.innerHTML = `
      <div class="hover-meta-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
        <span class="hover-meta-label">Dimensions</span>
        <span class="hover-meta-val">${item.width} x ${item.height} px</span>
      </div>
    `;

    if (item.metadata) {
      for (let [k, v] of Object.entries(item.metadata)) {
        if (typeof v !== 'object') {
          els.modalMetaList.innerHTML += `
            <div class="hover-meta-row" style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);">
              <span class="hover-meta-label" style="text-transform: capitalize;">${k.replace('_', ' ')}</span>
              <span class="hover-meta-val" style="font-family: monospace;">${v}</span>
            </div>
          `;
        }
      }
    } else {
      els.modalMetaList.innerHTML += `
        <div style="font-size: 0.85rem; color: var(--text-secondary); padding: 10px 0;">
          No metadata associated with this image file.
        </div>
      `;
    }

    hideLoading();
    els.detailsModal.style.display = 'flex';
  } catch (err) {
    hideLoading();
    alert(`Failed to load image details: ${err.message}`);
  }
}

function closeImageDetails() {
  els.detailsModal.style.display = 'none';
  els.modalImage.src = '';
}

// 11. Clear state
function clearDataset() {
  if (confirm('Clear the loaded dataset?')) {
    state.engineA.clear();
    state.engineB.clear();
    state.zipHandler = new ZipHandler();
    
    state.activeFolderA = '';
    state.activeFolderB = '';
    state.pageA = 1;
    state.pageB = 1;
    
    els.titlePathA.textContent = 'No folder assigned';
    els.titlePathB.textContent = 'No folder assigned';
    els.infoCountA.textContent = '0 images';
    els.infoCountB.textContent = '0 images';
    
    els.folderTreeContainer.innerHTML = `
      <div class="empty-state" style="padding:10px; font-size: 0.85rem;">
        Drop a zip to explorer folders.
      </div>
    `;
    
    els.statTotal.textContent = '-';
    els.statAccuracy.textContent = '-';
    els.statCorrect.textContent = '-';
    els.statIncorrect.textContent = '-';
    els.confidenceFilterGroup.style.display = 'none';
    
    els.emptyCover.style.display = 'flex';
    els.btnClear.disabled = true;
    
    // Connect new zip handler to canvases
    state.engineA.zipHandler = state.zipHandler;
    state.engineB.zipHandler = state.zipHandler;
  }
}

// 12. Global Overlay HUD Helpers
function showLoading(msg, submsg) {
  els.loadMsg.textContent = msg;
  els.loadSubmsg.textContent = submsg;
  els.loadingOverlay.style.display = 'flex';
}

function updateLoadingMsg(msg, submsg) {
  els.loadMsg.textContent = msg;
  els.loadSubmsg.textContent = submsg;
}

function hideLoading() {
  els.loadingOverlay.style.display = 'none';
}

// Run App!
init();
