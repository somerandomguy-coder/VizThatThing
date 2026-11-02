import './style.css';
import { DatasetHandler } from './dataset-handler.js';
import { CanvasEngine } from './canvas-engine.js';
import {
  packLayout,
  justifyLayout,
  scatterLayout,
  clusterIslandsLayout,
  colorMapLayout,
  getClusterColor
} from './packer.js';
import {
  renderFolderTree,
  calculateMetrics,
  renderClusterList,
  renderColorPaletteSection,
  renderThemeBars,
  renderMetricChips
} from './dashboard.js';
import { AnalysisController } from './analysis/analysis-controller.js';
import { ModelManager, MODEL_SPECS } from './ml/model-manager.js';
import { ICONS } from './ui/icons.js';
import { ToastManager } from './ui/toast.js';
import { drawRangeHistogram, drawRgbCurve } from './ui/charts.js';
import { buildSampleDatasetZip } from './ui/sample-dataset.js';

// Application State
const state = {
  theme: 'light',
  datasetHandler: new DatasetHandler(),
  analysisController: new AnalysisController(),
  modelManager: new ModelManager(),
  toast: null,

  engineA: null,
  engineB: null,

  activeFolderA: '',
  activeFolderB: '',

  pageA: 1,
  pageB: 1,
  pageSize: 500,

  filteredImagesA: [],
  filteredImagesB: [],

  // Spatial & Display Modes
  layoutMode: 'pack', // 'pack' | 'grid' | 'pca' | 'umap' | 'clusters' | 'colormap'
  renderStyle: 'sprites', // 'sprites' | 'points'
  colorBy: 'none', // 'none' | 'cluster' | 'dominant' | 'prediction' | 'exposure' | 'sharpness'
  showBboxes: true,
  thumbSize: 180,
  gapSize: 6,
  isSplit: false,
  isLinked: false,
  activePanel: 'A',

  // Projection Configs
  embeddingSource: 'visual', // 'visual' | 'clip'
  clusterK: 'auto',
  umapNeighbors: 15,
  colorMapAxes: 'hue-lum',
  relaxOverlaps: true,

  // Filters
  searchQuery: '',
  minConfidence: 0.0,
  maxConfidence: 1.0,
  filterA: 'all',
  filterB: 'all',

  // Analytical, Photo & AI Filters
  activeClusterId: null,
  activeColorFamily: null,
  activeTheme: null,
  activeExposure: null,
  activeSharpnessLabel: null,
  activeResolution: null,
  activeAspect: null,
  minBrightness: 0,
  maxBrightness: 255,
  minSharpness: 0,
  faceFilter: 'all', // 'all' | 'has' | 'multi' | 'none'
  humanFilter: 'all', // 'all' | 'has' | 'crowd' | 'none'

  // Modal Navigation Context
  modalItem: null,
  modalList: [],
  modalIndex: -1
};

const els = {};

function queryElements() {
  const ids = [
    'main-container',
    'sidebar',
    'btn-toggle-sidebar',
    'dataset-badge',
    'spatial-mode-group',
    'scatter-render-group',
    'select-color-by',
    'btn-toggle-bboxes',
    'btn-toggle-split',
    'btn-link-viewports',
    'btn-header-open',
    'btn-clear-all',
    'btn-toggle-theme',
    'theme-icon-slot',
    'active-filters-bar',
    'active-filters-label',
    'btn-reset-filters',
    'stat-total',
    'stat-accuracy',
    'stat-correct',
    'stat-incorrect',
    'mock-predictions-container',
    'btn-generate-mock',
    'search-input',
    'confidence-filter-group',
    'confidence-histogram',
    'confidence-min',
    'confidence-max',
    'confidence-range-label',
    'folder-tree-container',
    'slider-thumb-size',
    'lbl-thumb-size',
    'slider-gap-size',
    'lbl-gap-size',
    'lbl-pca-var',
    'select-embedding-source',
    'select-cluster-k',
    'slider-umap-neighbors',
    'lbl-umap-neighbors',
    'select-colormap-axes',
    'chk-relax-overlaps',
    'btn-recompute-projections',
    'lbl-silhouette',
    'cluster-list',
    'color-spectrum-bar',
    'palette-family-chips',
    'theme-bars-container',
    'exposure-chips',
    'lbl-brightness-range',
    'brightness-histogram',
    'brightness-min',
    'brightness-max',
    'sharpness-chips',
    'lbl-sharpness-min',
    'sharpness-histogram',
    'slider-sharpness-min',
    'resolution-chips',
    'aspect-chips',
    'btn-clear-model-cache',
    'select-ai-scope',
    'badge-cache-face',
    'prog-wrap-face',
    'prog-bar-face',
    'prog-lbl-face',
    'btn-run-faces',
    'filter-group-faces',
    'badge-cache-human',
    'prog-wrap-human',
    'prog-bar-human',
    'prog-lbl-human',
    'btn-run-humans',
    'filter-group-humans',
    'badge-cache-clip',
    'input-clip-themes',
    'prog-wrap-clip',
    'prog-bar-clip',
    'prog-lbl-clip',
    'btn-run-clip',
    'panel-canvas-a',
    'panel-canvas-b',
    'title-path-a',
    'info-count-a',
    'select-filter-a',
    'zoom-readout-a',
    'title-path-b',
    'info-count-b',
    'select-filter-b',
    'zoom-readout-b',
    'btn-zoom-in-a',
    'btn-zoom-out-a',
    'btn-zoom-fit-a',
    'btn-zoom-in-b',
    'btn-zoom-out-b',
    'btn-zoom-fit-b',
    'btn-prev-page-a',
    'btn-next-page-a',
    'lbl-page-a',
    'btn-prev-page-b',
    'btn-next-page-b',
    'lbl-page-b',
    'viewport-empty-cover',
    'btn-mount-folder',
    'btn-upload-folder',
    'btn-upload-file',
    'btn-load-sample',
    'file-input',
    'folder-input',
    'bg-task-pill',
    'bg-task-msg',
    'bg-task-fill',
    'hover-card',
    'hc-thumb',
    'hc-name',
    'hc-path',
    'hc-badges',
    'hc-meta',
    'details-modal',
    'modal-prev',
    'modal-next',
    'modal-image',
    'modal-bbox-canvas',
    'modal-filename',
    'modal-filepath',
    'modal-close',
    'modal-chk-bboxes',
    'modal-rgb-curve',
    'modal-palette-row',
    'modal-photo-grid',
    'modal-meta-list',
    'drop-overlay',
    'loading-overlay',
    'load-msg',
    'load-submsg',
    'toast-container'
  ];

  for (const id of ids) {
    const camel = id.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    els[camel] = document.getElementById(id);
  }
}

function hydrateIcons() {
  document.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (ICONS[name]) node.innerHTML = ICONS[name];
  });
}

function init() {
  queryElements();
  hydrateIcons();

  state.toast = new ToastManager(els.toastContainer);

  const canvasA = document.getElementById('canvas-a');
  const canvasB = document.getElementById('canvas-b');
  state.engineA = new CanvasEngine(canvasA, state.datasetHandler);
  state.engineB = new CanvasEngine(canvasB, state.datasetHandler);

  state.engineA.setPeerEngine(state.engineB, false);
  state.engineB.setPeerEngine(state.engineA, false);

  state.engineA.onScaleChange = (s) => {
    els.zoomReadoutA.textContent = `${Math.round(s * 100)}%`;
  };
  state.engineB.onScaleChange = (s) => {
    els.zoomReadoutB.textContent = `${Math.round(s * 100)}%`;
  };

  setupEventListeners();
  refreshModelCacheBadges();
  handleResize();
  setActivePanel('A');
}

function setupEventListeners() {
  window.addEventListener('resize', () => {
    handleResize();
    redrawSidebarCharts();
    if (state.modalItem) drawModalBboxes(state.modalItem);
  });

  // Sidebar collapse & tabs
  els.btnToggleSidebar.addEventListener('click', () => {
    els.sidebar.classList.toggle('collapsed');
    setTimeout(handleResize, 210);
  });

  document.querySelectorAll('.sidebar-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const tabId = `tab-${btn.dataset.tab}`;
      document.getElementById(tabId)?.classList.add('active');
      requestAnimationFrame(redrawSidebarCharts);
    });
  });

  // Theme switcher (Light default <-> Dark)
  els.btnToggleTheme.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    els.themeIconSlot.innerHTML = state.theme === 'light' ? ICONS.moon : ICONS.sun;
    state.engineA.setTheme(state.theme);
    state.engineB.setTheme(state.theme);
    redrawSidebarCharts();
    if (state.modalItem && state.modalItem.analysis) {
      drawRgbCurve(els.modalRgbCurve, state.modalItem.analysis.histograms, state.theme);
    }
  });

  // Spatial Mode Switcher
  els.spatialModeGroup.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.spatialModeGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.layoutMode = btn.dataset.mode;

      const is2D = ['pca', 'umap', 'clusters', 'colormap'].includes(state.layoutMode);
      els.scatterRenderGroup.classList.toggle('hidden', !is2D);

      updateLayouts(true);
    });
  });

  // Sprites vs Points toggle
  els.scatterRenderGroup.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.scatterRenderGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.renderStyle = btn.dataset.render;
      state.engineA.setDisplayOptions({ renderStyle: state.renderStyle });
      state.engineB.setDisplayOptions({ renderStyle: state.renderStyle });
      // Re-render because Points mode plots ALL filtered items unpaginated!
      updateLayouts(false);
    });
  });

  // Color By & Bounding Box toggle
  els.selectColorBy.addEventListener('change', (e) => {
    state.colorBy = e.target.value;
    state.engineA.setDisplayOptions({ colorBy: state.colorBy });
    state.engineB.setDisplayOptions({ colorBy: state.colorBy });
  });

  els.btnToggleBboxes.addEventListener('click', () => {
    state.showBboxes = !state.showBboxes;
    els.btnToggleBboxes.classList.toggle('active', state.showBboxes);
    state.engineA.setDisplayOptions({ showBboxes: state.showBboxes });
    state.engineB.setDisplayOptions({ showBboxes: state.showBboxes });
  });

  // Split View & Sync
  els.btnToggleSplit.addEventListener('click', toggleSplitView);
  els.btnLinkViewports.addEventListener('click', () => {
    state.isLinked = !state.isLinked;
    els.btnLinkViewports.classList.toggle('active', state.isLinked);
    state.engineA.setLinked(state.isLinked);
    state.engineB.setLinked(state.isLinked);
  });

  // Active Viewport Selection
  els.panelCanvasA.addEventListener('mousedown', () => setActivePanel('A'));
  els.panelCanvasB.addEventListener('mousedown', () => setActivePanel('B'));

  // Dataset Load Controls
  els.btnUploadFile.addEventListener('click', () => els.fileInput.click());
  els.btnHeaderOpen.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleZipFile(e.target.files[0]);
  });

  els.btnUploadFolder.addEventListener('click', () => els.folderInput.click());
  els.folderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFolderUpload(e.target.files);
  });

  els.btnMountFolder.addEventListener('click', handleMountDirectory);
  els.btnLoadSample.addEventListener('click', handleLoadSampleDataset);
  els.btnClearAll.addEventListener('click', clearDataset);

  // Drag & Drop ZIP
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    els.dropOverlay.classList.add('dragover');
  });
  els.dropOverlay.addEventListener('dragover', (e) => e.preventDefault());
  els.dropOverlay.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.relatedTarget === null) els.dropOverlay.classList.remove('dragover');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropOverlay.classList.remove('dragover');
    const files = Array.from(e.dataTransfer?.files || []);
    const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (zipFile) {
      handleZipFile(zipFile);
    } else if (files.length > 0) {
      state.toast.show('Drop a .zip archive or use Mount / Select Folder for directories.', 'error');
    }
  });

  // Zoom & Pagination HUDs
  els.btnZoomInA.addEventListener('click', () => state.engineA.zoomIn());
  els.btnZoomOutA.addEventListener('click', () => state.engineA.zoomOut());
  els.btnZoomFitA.addEventListener('click', () => state.engineA.zoomToFit());
  els.btnZoomInB.addEventListener('click', () => state.engineB.zoomIn());
  els.btnZoomOutB.addEventListener('click', () => state.engineB.zoomOut());
  els.btnZoomFitB.addEventListener('click', () => state.engineB.zoomToFit());

  els.btnPrevPageA.addEventListener('click', () => changePage('A', -1));
  els.btnNextPageA.addEventListener('click', () => changePage('A', 1));
  els.btnPrevPageB.addEventListener('click', () => changePage('B', -1));
  els.btnNextPageB.addEventListener('click', () => changePage('B', 1));

  // Sizing Sliders
  els.sliderThumbSize.addEventListener('input', (e) => {
    state.thumbSize = Number(e.target.value);
    els.lblThumbSize.textContent = `${state.thumbSize}px`;
    updateLayouts(false);
  });
  els.sliderGapSize.addEventListener('input', (e) => {
    state.gapSize = Number(e.target.value);
    els.lblGapSize.textContent = `${state.gapSize}px`;
    updateLayouts(false);
  });

  // Search, Confidence & Prediction Filters
  els.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    handleFiltersChange();
  });

  els.selectFilterA.addEventListener('change', (e) => {
    state.filterA = e.target.value;
    applyFiltersAndLayout('A');
  });
  els.selectFilterB.addEventListener('change', (e) => {
    state.filterB = e.target.value;
    applyFiltersAndLayout('B');
  });

  els.btnGenerateMock.addEventListener('click', () => {
    state.datasetHandler.generateMockPredictions();
    els.mockPredictionsContainer.classList.add('hidden');
    updateGlobalDashboard();
    handleFiltersChange();
    state.toast.show('Simulated predictions generated across dataset.', 'success');
  });

  els.confidenceMin.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.minConfidence = Math.max(0, Math.min(1, val));
      els.confidenceRangeLabel.textContent = `${state.minConfidence.toFixed(2)} – ${state.maxConfidence.toFixed(2)}`;
      handleFiltersChange();
    }
  });
  els.confidenceMax.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.maxConfidence = Math.max(0, Math.min(1, val));
      els.confidenceRangeLabel.textContent = `${state.minConfidence.toFixed(2)} – ${state.maxConfidence.toFixed(2)}`;
      handleFiltersChange();
    }
  });

  els.btnResetFilters.addEventListener('click', resetAllAnalyticalFilters);

  // Analysis & Projection Controls
  els.selectEmbeddingSource.addEventListener('change', async (e) => {
    const requested = e.target.value;
    if (requested === 'clip') {
      const hasAnyClip = state.datasetHandler.images.some((im) => im.ai?.embedding);
      if (!hasAnyClip) {
        state.toast.show('Run CLIP Semantic Embeddings in the AI Lab tab first.', 'info');
        els.selectEmbeddingSource.value = 'visual';
        return;
      }
    }
    state.embeddingSource = requested;
    await triggerRecomputeProjections();
  });

  els.selectClusterK.addEventListener('change', async (e) => {
    state.clusterK = e.target.value === 'auto' ? 'auto' : Number(e.target.value);
    await triggerRecomputeProjections();
  });

  els.sliderUmapNeighbors.addEventListener('input', (e) => {
    state.umapNeighbors = Number(e.target.value);
    els.lblUmapNeighbors.textContent = String(state.umapNeighbors);
  });

  els.selectColormapAxes.addEventListener('change', (e) => {
    state.colorMapAxes = e.target.value;
    if (state.layoutMode === 'colormap') updateLayouts(true);
  });

  els.chkRelaxOverlaps.addEventListener('change', (e) => {
    state.relaxOverlaps = e.target.checked;
    if (['pca', 'umap', 'colormap'].includes(state.layoutMode)) updateLayouts(true);
  });

  els.btnRecomputeProjections.addEventListener('click', triggerRecomputeProjections);

  // Photography Sliders
  els.brightnessMin.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v)) {
      state.minBrightness = Math.max(0, Math.min(255, v));
      els.lblBrightnessRange.textContent = `${state.minBrightness} – ${state.maxBrightness}`;
      handleFiltersChange();
    }
  });
  els.brightnessMax.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v)) {
      state.maxBrightness = Math.max(0, Math.min(255, v));
      els.lblBrightnessRange.textContent = `${state.minBrightness} – ${state.maxBrightness}`;
      handleFiltersChange();
    }
  });
  els.sliderSharpnessMin.addEventListener('input', (e) => {
    state.minSharpness = Number(e.target.value);
    els.lblSharpnessMin.textContent = `${state.minSharpness} / 100`;
    handleFiltersChange();
  });

  // AI Lab Actions
  els.btnRunFaces.addEventListener('click', handleRunFaceScan);
  els.btnRunHumans.addEventListener('click', handleRunHumanScan);
  els.btnRunClip.addEventListener('click', handleRunClipScan);

  els.btnClearModelCache.addEventListener('click', async () => {
    await state.modelManager.clearModelCache();
    await refreshModelCacheBadges();
    state.toast.show('Cleared cached ML weights from browser storage.', 'info');
  });

  els.filterGroupFaces.querySelectorAll('[data-face-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.filterGroupFaces.querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.faceFilter = btn.dataset.faceFilter;
      handleFiltersChange();
    });
  });

  els.filterGroupHumans.querySelectorAll('[data-human-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.filterGroupHumans.querySelectorAll('.filter-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.humanFilter = btn.dataset.humanFilter;
      handleFiltersChange();
    });
  });

  // Hover & Modal Inspector
  state.engineA.onHoverChange = (item, x, y) => handleInspectHover(item, x, y);
  state.engineB.onHoverChange = (item, x, y) => handleInspectHover(item, x, y);
  state.engineA.onItemClick = (li) => openImageDetails(li.item, state.filteredImagesA);
  state.engineB.onItemClick = (li) => openImageDetails(li.item, state.filteredImagesB);

  els.modalClose.addEventListener('click', closeImageDetails);
  els.detailsModal.addEventListener('click', (e) => {
    if (e.target === els.detailsModal) closeImageDetails();
  });
  els.modalPrev.addEventListener('click', () => stepModalImage(-1));
  els.modalNext.addEventListener('click', () => stepModalImage(1));
  els.modalChkBboxes.addEventListener('change', () => {
    if (state.modalItem) drawModalBboxes(state.modalItem);
  });

  window.addEventListener('keydown', (e) => {
    if (els.detailsModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeImageDetails();
    else if (e.key === 'ArrowLeft') stepModalImage(-1);
    else if (e.key === 'ArrowRight') stepModalImage(1);
  });
}

function setActivePanel(panelId) {
  if (panelId === 'B' && !state.isSplit) return;
  state.activePanel = panelId;
  els.panelCanvasA.classList.toggle('active-panel', panelId === 'A');
  els.panelCanvasB.classList.toggle('active-panel', panelId === 'B');
}

function handleResize() {
  state.engineA.resize();
  state.engineB.resize();
}

function toggleSplitView() {
  state.isSplit = !state.isSplit;
  els.btnToggleSplit.classList.toggle('active', state.isSplit);
  els.panelCanvasB.classList.toggle('hidden', !state.isSplit);
  els.mainContainer.classList.toggle('split-view-active', state.isSplit);
  els.btnLinkViewports.classList.toggle('hidden', !state.isSplit);

  if (state.isSplit) {
    if (!state.activeFolderB && state.datasetHandler.isLoaded) {
      loadFolderIntoCanvas(state.activeFolderA || 'root', 'B');
    }
  } else {
    if (state.isLinked) {
      state.isLinked = false;
      els.btnLinkViewports.classList.remove('active');
      state.engineA.setLinked(false);
      state.engineB.setLinked(false);
    }
    setActivePanel('A');
    state.engineB.clear();
    state.activeFolderB = '';
    els.titlePathB.textContent = 'No folder';
    els.infoCountB.textContent = '0 items';
  }

  requestAnimationFrame(() => {
    handleResize();
    updateLayouts(false);
  });
}

// Dataset Ingestion Flows
async function handleLoadSampleDataset() {
  showLoading('Synthesizing sample dataset...', 'Generating 36 photography & classification scenes...');
  try {
    const sampleZip = await buildSampleDatasetZip();
    await handleZipFile(sampleZip);
  } catch (err) {
    hideLoading();
    state.toast.show(`Sample generation failed: ${err.message}`, 'error');
  }
}

async function handleZipFile(file) {
  showLoading('Reading ZIP archive...', file.name || 'Archive');
  try {
    const tree = await state.datasetHandler.loadZip(file, (p) => {
      updateLoadingMsg(p.message, `${p.percent ?? 0}%`);
    });
    await finalizeDatasetMount(tree);
  } catch (err) {
    hideLoading();
    state.toast.show(err.message, 'error');
  }
}

async function handleFolderUpload(files) {
  showLoading('Indexing selected folder...', `${files.length} files`);
  try {
    const tree = await state.datasetHandler.loadFilesList(files, (p) => {
      updateLoadingMsg(p.message, `${p.percent ?? 0}%`);
    });
    await finalizeDatasetMount(tree);
  } catch (err) {
    hideLoading();
    state.toast.show(err.message, 'error');
  }
}

async function handleMountDirectory() {
  if (!window.showDirectoryPicker) {
    state.toast.show('File System Access API requires Chrome/Edge. Use Select Folder or Open ZIP instead.', 'info', 4500);
    return;
  }
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read-only' });
    showLoading('Mounting local folder...', dirHandle.name);
    const tree = await state.datasetHandler.loadDirectory(dirHandle, (p) => {
      updateLoadingMsg(p.message, `${p.percent ?? 0}%`);
    });
    await finalizeDatasetMount(tree);
  } catch (err) {
    hideLoading();
    if (err.name !== 'AbortError') {
      state.toast.show(`Mount failed: ${err.message}`, 'error');
    }
  }
}

async function finalizeDatasetMount(tree) {
  hideLoading();
  state.analysisController.cancelActive();
  state.modelManager.cancelRunningScan();

  if (state.datasetHandler.images.length === 0) {
    state.toast.show('No supported images (.png, .jpg, .webp, .bmp, .gif) found in dataset.', 'error');
    return;
  }

  resetAllAnalyticalFilters(false);
  els.viewportEmptyCover.classList.add('hidden');
  els.btnClearAll.disabled = false;
  els.datasetBadge.textContent = `${state.datasetHandler.datasetName} (${state.datasetHandler.images.length})`;

  state.activeFolderA = 'root';
  state.activeFolderB = state.isSplit ? 'root' : '';
  state.pageA = 1;
  state.pageB = 1;

  renderFolderTree(tree, els.folderTreeContainer, assignFolderToCanvas);
  updateGlobalDashboard();

  await loadFolderIntoCanvas('root', 'A');
  if (state.isSplit) {
    await loadFolderIntoCanvas('root', 'B');
  }

  // Launch non-blocking background feature extraction, PCA, UMAP, and K-Means++
  runBackgroundAnalysis();
}

async function runBackgroundAnalysis() {
  const images = state.datasetHandler.images;
  if (images.length === 0) return;

  els.bgTaskPill.classList.remove('hidden');
  els.bgTaskMsg.textContent = 'Analyzing colors, lighting & sharpness...';
  els.bgTaskFill.style.width = '4%';

  const result = await state.analysisController.analyzeDataset(
    images,
    state.datasetHandler,
    {
      source: state.embeddingSource,
      k: state.clusterK,
      nNeighbors: state.umapNeighbors
    },
    (prog) => {
      els.bgTaskMsg.textContent = prog.message;
      els.bgTaskFill.style.width = `${prog.percent}%`;
    }
  );

  els.bgTaskPill.classList.add('hidden');
  if (!result) return; // Cancelled due to dataset switch

  refreshAnalyticsPanels();
  if (['pca', 'umap', 'clusters', 'colormap'].includes(state.layoutMode)) {
    updateLayouts(true);
  } else {
    state.engineA.draw();
    state.engineB.draw();
  }
}

async function triggerRecomputeProjections() {
  if (!state.datasetHandler.isLoaded) return;
  els.bgTaskPill.classList.remove('hidden');
  els.bgTaskMsg.textContent = 'Recomputing PCA, UMAP & K-Means++...';
  els.bgTaskFill.style.width = '55%';

  await new Promise((r) => setTimeout(r, 16));
  await state.analysisController.recomputeProjections(state.datasetHandler.images, {
    source: state.embeddingSource,
    k: state.clusterK,
    nNeighbors: state.umapNeighbors
  });

  els.bgTaskPill.classList.add('hidden');
  refreshAnalyticsPanels();
  updateLayouts(true);
}

// Refresh Analysis & Photo Sidebar Tabs
function refreshAnalyticsPanels() {
  const summary = state.analysisController.summary;
  const proj = state.analysisController.projectionMeta;
  if (!summary) return;

  // PCA Variance & Silhouette
  const [v1, v2] = proj.varianceExplained || [0, 0];
  els.lblPcaVar.textContent = `PCA ${(v1 + v2).toFixed(0)}% var`;
  els.lblSilhouette.textContent = `k=${proj.k} · sil ${proj.silhouette.toFixed(2)}`;

  renderClusterList(proj.clusters, state.activeClusterId, els.clusterList, (cid) => {
    state.activeClusterId = state.activeClusterId === cid ? null : cid;
    refreshAnalyticsPanels();
    handleFiltersChange();
  });

  renderColorPaletteSection(
    summary.paletteSummary,
    state.activeColorFamily,
    els.colorSpectrumBar,
    els.paletteFamilyChips,
    (famId) => {
      state.activeColorFamily = state.activeColorFamily === famId ? null : famId;
      refreshAnalyticsPanels();
      handleFiltersChange();
    }
  );

  // Merge CLIP themes if CLIP was run
  const combinedThemes = { ...summary.themeCounts };
  for (const img of state.datasetHandler.images) {
    if (img.ai?.clipThemes) {
      for (const ct of img.ai.clipThemes) {
        const key = `CLIP: ${ct}`;
        combinedThemes[key] = (combinedThemes[key] || 0) + 1;
      }
    }
  }

  renderThemeBars(
    combinedThemes,
    summary.analyzedCount,
    state.activeTheme,
    els.themeBarsContainer,
    (themeName) => {
      state.activeTheme = state.activeTheme === themeName ? null : themeName;
      refreshAnalyticsPanels();
      handleFiltersChange();
    }
  );

  // Photography Chips
  renderMetricChips(summary.exposureCounts, state.activeExposure, els.exposureChips, (val) => {
    state.activeExposure = state.activeExposure === val ? null : val;
    refreshAnalyticsPanels();
    handleFiltersChange();
  });

  renderMetricChips(summary.sharpnessCounts, state.activeSharpnessLabel, els.sharpnessChips, (val) => {
    state.activeSharpnessLabel = state.activeSharpnessLabel === val ? null : val;
    refreshAnalyticsPanels();
    handleFiltersChange();
  });

  renderMetricChips(summary.resolutionCounts, state.activeResolution, els.resolutionChips, (val) => {
    state.activeResolution = state.activeResolution === val ? null : val;
    refreshAnalyticsPanels();
    handleFiltersChange();
  });

  renderMetricChips(summary.aspectCounts, state.activeAspect, els.aspectChips, (val) => {
    state.activeAspect = state.activeAspect === val ? null : val;
    refreshAnalyticsPanels();
    handleFiltersChange();
  });

  redrawSidebarCharts();
}

function redrawSidebarCharts() {
  const stats = calculateMetrics(state.datasetHandler.images);
  if (stats.confidences.length > 0) {
    drawRangeHistogram(
      els.confidenceHistogram,
      stats.confidences,
      0,
      1,
      state.minConfidence,
      state.maxConfidence,
      state.theme
    );
  }

  const summary = state.analysisController.summary;
  if (summary) {
    drawRangeHistogram(
      els.brightnessHistogram,
      summary.brightnessValues,
      0,
      255,
      state.minBrightness,
      state.maxBrightness,
      state.theme
    );
    drawRangeHistogram(
      els.sharpnessHistogram,
      summary.sharpnessValues,
      0,
      100,
      state.minSharpness,
      100,
      state.theme
    );
  }
}

// On-Demand Browser AI Scans
function getTargetAiImages() {
  const scope = els.selectAiScope.value;
  if (scope === 'all') return state.datasetHandler.images;
  const folder = state.activePanel === 'B' && state.isSplit ? state.activeFolderB : state.activeFolderA;
  return state.datasetHandler.getImagesInFolder(folder || 'root');
}

async function refreshModelCacheBadges() {
  const cached = await state.modelManager.checkCachedModels();
  const applyBadge = (el, isCached, defaultLabel) => {
    if (!el) return;
    el.textContent = isCached ? 'Cached' : defaultLabel;
    el.classList.toggle('cached', isCached);
  };
  applyBadge(els.badgeCacheFace, cached.face, MODEL_SPECS.face.sizeLabel);
  applyBadge(els.badgeCacheHuman, cached.human, MODEL_SPECS.human.sizeLabel);
  applyBadge(els.badgeCacheClip, cached.clip, MODEL_SPECS.clip.sizeLabel);
}

async function handleRunFaceScan() {
  const targets = getTargetAiImages();
  if (targets.length === 0) {
    state.toast.show('Load a dataset before running Face Detection.', 'info');
    return;
  }

  els.btnRunFaces.disabled = true;
  els.progWrapFace.classList.remove('hidden');

  try {
    const res = await state.modelManager.runFaceDetection(targets, state.datasetHandler, (p) => {
      els.progBarFace.style.width = `${p.percent ?? 0}%`;
      els.progLblFace.textContent = p.message || '';
    });
    await refreshModelCacheBadges();
    els.filterGroupFaces.classList.remove('hidden');
    state.engineA.draw();
    state.engineB.draw();
    state.toast.show(
      `Face scan complete: ${res.totalFaces} faces across ${res.detectedImages} images.`,
      'success'
    );
  } catch (err) {
    state.toast.show(`Face detector error: ${err.message}`, 'error', 4500);
    els.progLblFace.textContent = 'Failed — check network connection';
  } finally {
    els.btnRunFaces.disabled = false;
  }
}

async function handleRunHumanScan() {
  const targets = getTargetAiImages();
  if (targets.length === 0) {
    state.toast.show('Load a dataset before running Human Detection.', 'info');
    return;
  }

  els.btnRunHumans.disabled = true;
  els.progWrapHuman.classList.remove('hidden');

  try {
    const res = await state.modelManager.runHumanDetection(targets, state.datasetHandler, (p) => {
      els.progBarHuman.style.width = `${p.percent ?? 0}%`;
      els.progLblHuman.textContent = p.message || '';
    });
    await refreshModelCacheBadges();
    els.filterGroupHumans.classList.remove('hidden');
    state.engineA.draw();
    state.engineB.draw();
    state.toast.show(
      `Human scan complete: ${res.totalHumans} persons across ${res.detectedImages} images.`,
      'success'
    );
  } catch (err) {
    state.toast.show(`Human detector error: ${err.message}`, 'error', 4500);
    els.progLblHuman.textContent = 'Failed — check network connection';
  } finally {
    els.btnRunHumans.disabled = false;
  }
}

async function handleRunClipScan() {
  const targets = state.datasetHandler.images; // Semantic projection works best dataset-wide
  if (targets.length === 0) {
    state.toast.show('Load a dataset before running CLIP.', 'info');
    return;
  }

  const customThemes = els.inputClipThemes.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  els.btnRunClip.disabled = true;
  els.progWrapClip.classList.remove('hidden');

  try {
    await state.modelManager.runClipSemanticAnalysis(
      targets,
      state.datasetHandler,
      customThemes,
      (p) => {
        els.progBarClip.style.width = `${p.percent ?? 0}%`;
        els.progLblClip.textContent = p.message || '';
      }
    );
    await refreshModelCacheBadges();
    state.embeddingSource = 'clip';
    els.selectEmbeddingSource.value = 'clip';
    await triggerRecomputeProjections();
    state.toast.show('CLIP 512-d semantic embeddings & custom themes applied.', 'success');
  } catch (err) {
    state.toast.show(`CLIP error: ${err.message}`, 'error', 4500);
    els.progLblClip.textContent = 'Failed to load CLIP model';
  } finally {
    els.btnRunClip.disabled = false;
  }
}

// Folder & Filtering Pipeline
async function assignFolderToCanvas(folderPath, target) {
  const canvasId = target === 'click' ? state.activePanel : target;
  if (canvasId === 'B' && !state.isSplit) {
    toggleSplitView();
  }
  await loadFolderIntoCanvas(folderPath, canvasId);
}

async function loadFolderIntoCanvas(folderPath, canvasId) {
  if (canvasId === 'A') {
    state.activeFolderA = folderPath;
    state.pageA = 1;
    els.titlePathA.textContent = folderPath === 'root' ? 'All Images' : folderPath;
    await applyFiltersAndLayout('A');
  } else {
    state.activeFolderB = folderPath;
    state.pageB = 1;
    els.titlePathB.textContent = folderPath === 'root' ? 'All Images' : folderPath;
    await applyFiltersAndLayout('B');
  }
}

function updateGlobalDashboard() {
  const stats = calculateMetrics(state.datasetHandler.images);
  els.statTotal.textContent = stats.total.toLocaleString();

  if (stats.hasLabels) {
    els.statAccuracy.textContent = `${stats.accuracy.toFixed(1)}%`;
    els.statCorrect.textContent = stats.correctCount.toLocaleString();
    els.statIncorrect.textContent = stats.incorrectCount.toLocaleString();
  } else {
    els.statAccuracy.textContent = '—';
    els.statCorrect.textContent = '—';
    els.statIncorrect.textContent = '—';
  }

  els.confidenceFilterGroup.classList.toggle('hidden', stats.confidences.length === 0);
  els.mockPredictionsContainer.classList.toggle(
    'hidden',
    !(state.datasetHandler.isLoaded && !stats.hasLabels)
  );
  redrawSidebarCharts();
}

function countActiveFilters() {
  let c = 0;
  if (state.searchQuery.trim()) c++;
  if (state.minConfidence > 0 || state.maxConfidence < 1) c++;
  if (state.activeClusterId !== null) c++;
  if (state.activeColorFamily !== null) c++;
  if (state.activeTheme !== null) c++;
  if (state.activeExposure !== null) c++;
  if (state.activeSharpnessLabel !== null) c++;
  if (state.activeResolution !== null) c++;
  if (state.activeAspect !== null) c++;
  if (state.minBrightness > 0 || state.maxBrightness < 255) c++;
  if (state.minSharpness > 0) c++;
  if (state.faceFilter !== 'all') c++;
  if (state.humanFilter !== 'all') c++;
  return c;
}

function resetAllAnalyticalFilters(rerender = true) {
  state.searchQuery = '';
  state.minConfidence = 0;
  state.maxConfidence = 1;
  state.activeClusterId = null;
  state.activeColorFamily = null;
  state.activeTheme = null;
  state.activeExposure = null;
  state.activeSharpnessLabel = null;
  state.activeResolution = null;
  state.activeAspect = null;
  state.minBrightness = 0;
  state.maxBrightness = 255;
  state.minSharpness = 0;
  state.faceFilter = 'all';
  state.humanFilter = 'all';

  els.searchInput.value = '';
  els.confidenceMin.value = '0.00';
  els.confidenceMax.value = '1.00';
  els.confidenceRangeLabel.textContent = '0.00 – 1.00';
  els.brightnessMin.value = '0';
  els.brightnessMax.value = '255';
  els.lblBrightnessRange.textContent = '0 – 255';
  els.sliderSharpnessMin.value = '0';
  els.lblSharpnessMin.textContent = '0 / 100';

  els.filterGroupFaces.querySelectorAll('.filter-chip').forEach((b, i) => b.classList.toggle('active', i === 0));
  els.filterGroupHumans.querySelectorAll('.filter-chip').forEach((b, i) => b.classList.toggle('active', i === 0));

  if (rerender) {
    refreshAnalyticsPanels();
    handleFiltersChange();
  } else {
    els.activeFiltersBar.classList.add('hidden');
  }
}

function handleFiltersChange() {
  const activeCount = countActiveFilters();
  els.activeFiltersBar.classList.toggle('hidden', activeCount === 0);
  if (activeCount > 0) {
    els.activeFiltersLabel.textContent = `${activeCount} filter${activeCount > 1 ? 's' : ''} active`;
  }

  if (state.activeFolderA !== '') applyFiltersAndLayout('A');
  if (state.activeFolderB !== '' && state.isSplit) applyFiltersAndLayout('B');

  redrawSidebarCharts();
}

function applyFilters(images, canvasId) {
  const query = state.searchQuery.toLowerCase().trim();
  const canvasFilter = canvasId === 'A' ? state.filterA : state.filterB;

  return images.filter((img) => {
    // 1. Confidence
    if (img.metadata?.confidence !== undefined) {
      const conf = Number(img.metadata.confidence);
      if (!isNaN(conf) && (conf < state.minConfidence || conf > state.maxConfidence)) return false;
    }

    // 2. Search query across name, path, metadata, themes, annotations
    if (query) {
      let hit = img.name.toLowerCase().includes(query) || img.fullPath.toLowerCase().includes(query);
      if (!hit && img.metadata) {
        hit = Object.values(img.metadata).some((v) => String(v).toLowerCase().includes(query));
      }
      if (!hit && img.analysis?.themes) {
        hit = img.analysis.themes.some((t) => t.toLowerCase().includes(query));
      }
      if (!hit && img.ai?.clipThemes) {
        hit = img.ai.clipThemes.some((t) => t.toLowerCase().includes(query));
      }
      if (!hit) return false;
    }

    // 3. Prediction correctness
    if (canvasFilter === 'correct' || canvasFilter === 'incorrect') {
      if (!img.metadata) return false;
      const pred = img.metadata.prediction ?? img.metadata.pred;
      const label = img.metadata.label ?? img.metadata.ground_truth ?? img.metadata.gt;
      if (pred === undefined || label === undefined) return false;
      const isOk = String(pred) === String(label);
      if (canvasFilter === 'correct' && !isOk) return false;
      if (canvasFilter === 'incorrect' && isOk) return false;
    }

    // 4. Cluster, Color & Theme filters
    if (state.activeClusterId !== null && img.clusterId !== state.activeClusterId) return false;
    if (state.activeColorFamily !== null && img.analysis?.colorFamily !== state.activeColorFamily) {
      return false;
    }
    if (state.activeTheme !== null) {
      if (state.activeTheme.startsWith('CLIP: ')) {
        const raw = state.activeTheme.slice(6);
        if (!img.ai?.clipThemes?.includes(raw)) return false;
      } else if (!img.analysis?.themes?.includes(state.activeTheme)) {
        return false;
      }
    }

    // 5. Photography & Quality filters
    if (img.analysis?.photo) {
      const p = img.analysis.photo;
      if (state.activeExposure && p.exposureStatus !== state.activeExposure) return false;
      if (state.activeSharpnessLabel && p.sharpnessLabel !== state.activeSharpnessLabel) return false;
      if (state.activeResolution && p.resolutionTier !== state.activeResolution) return false;
      if (state.activeAspect && p.aspectBucket !== state.activeAspect) return false;
      if (p.brightness < state.minBrightness || p.brightness > state.maxBrightness) return false;
      if (p.sharpness < state.minSharpness) return false;
    }

    // 6. AI Face & Human filters
    if (state.faceFilter !== 'all') {
      const cnt = img.ai?.faces?.length ?? 0;
      if (state.faceFilter === 'has' && cnt < 1) return false;
      if (state.faceFilter === 'multi' && cnt < 2) return false;
      if (state.faceFilter === 'none' && cnt > 0) return false;
    }
    if (state.humanFilter !== 'all') {
      const cnt = img.ai?.humans?.length ?? 0;
      if (state.humanFilter === 'has' && cnt < 1) return false;
      if (state.humanFilter === 'crowd' && cnt < 3) return false;
      if (state.humanFilter === 'none' && cnt > 0) return false;
    }

    return true;
  });
}

async function applyFiltersAndLayout(canvasId) {
  const folder = canvasId === 'A' ? state.activeFolderA : state.activeFolderB;
  const raw = state.datasetHandler.getImagesInFolder(folder);
  const filtered = applyFilters(raw, canvasId);

  if (canvasId === 'A') {
    state.filteredImagesA = filtered;
    els.infoCountA.textContent = `${filtered.length.toLocaleString()} items`;
    await renderCanvasPage('A', true);
  } else {
    state.filteredImagesB = filtered;
    els.infoCountB.textContent = `${filtered.length.toLocaleString()} items`;
    await renderCanvasPage('B', true);
  }
}

async function renderCanvasPage(canvasId, animate = true) {
  const images = canvasId === 'A' ? state.filteredImagesA : state.filteredImagesB;
  const engine = canvasId === 'A' ? state.engineA : state.engineB;

  const is2DMode = ['pca', 'umap', 'clusters', 'colormap'].includes(state.layoutMode);
  const unpaginatedPoints = is2DMode && state.renderStyle === 'points';

  let activeSlice = images;
  if (!unpaginatedPoints) {
    const totalPages = Math.max(1, Math.ceil(images.length / state.pageSize));
    let page = canvasId === 'A' ? state.pageA : state.pageB;
    if (page > totalPages) {
      page = totalPages;
      if (canvasId === 'A') state.pageA = page;
      else state.pageB = page;
    }

    const lblEl = canvasId === 'A' ? els.lblPageA : els.lblPageB;
    const prevEl = canvasId === 'A' ? els.btnPrevPageA : els.btnPrevPageB;
    const nextEl = canvasId === 'A' ? els.btnNextPageA : els.btnNextPageB;

    lblEl.textContent = `Page ${page} / ${totalPages}`;
    prevEl.disabled = page === 1;
    nextEl.disabled = page === totalPages;

    const startIndex = (page - 1) * state.pageSize;
    activeSlice = images.slice(startIndex, startIndex + state.pageSize);
  } else {
    const lblEl = canvasId === 'A' ? els.lblPageA : els.lblPageB;
    const prevEl = canvasId === 'A' ? els.btnPrevPageA : els.btnPrevPageB;
    const nextEl = canvasId === 'A' ? els.btnNextPageA : els.btnNextPageB;

    lblEl.textContent = `All ${images.length.toLocaleString()} points`;
    prevEl.disabled = true;
    nextEl.disabled = true;
  }

  if (activeSlice.length === 0) {
    engine.clear();
    return;
  }

  if (!unpaginatedPoints) {
    await state.datasetHandler.loadBatchDimensions(activeSlice);
  }

  const dpr = window.devicePixelRatio || 1;
  const containerW = engine.canvas.width / dpr;
  const [v1, v2] = state.analysisController.projectionMeta.varianceExplained || [0, 0];

  let layout;
  switch (state.layoutMode) {
    case 'grid':
      layout = justifyLayout(activeSlice, containerW, state.thumbSize * 0.76, state.gapSize);
      break;
    case 'pca':
      layout = scatterLayout(activeSlice, 'pca', {
        thumbSize: Math.min(130, state.thumbSize * 0.65),
        relaxOverlaps: state.relaxOverlaps,
        xLabel: v1 > 0 ? `PC 1 (${v1.toFixed(1)}% variance)` : 'PC 1',
        yLabel: v2 > 0 ? `PC 2 (${v2.toFixed(1)}% variance)` : 'PC 2'
      });
      break;
    case 'umap':
      layout = scatterLayout(activeSlice, 'umap', {
        thumbSize: Math.min(130, state.thumbSize * 0.65),
        relaxOverlaps: state.relaxOverlaps,
        xLabel: `UMAP 1 (${state.embeddingSource === 'clip' ? 'CLIP 512-d' : 'Visual 64-d'})`,
        yLabel: 'UMAP 2'
      });
      break;
    case 'clusters':
      layout = clusterIslandsLayout(activeSlice, Math.min(140, state.thumbSize * 0.72), state.gapSize);
      break;
    case 'colormap':
      layout = colorMapLayout(activeSlice, {
        thumbSize: Math.min(130, state.thumbSize * 0.62),
        axesMode: state.colorMapAxes,
        relaxOverlaps: state.relaxOverlaps
      });
      break;
    case 'pack':
    default:
      layout = packLayout(activeSlice, state.thumbSize, state.gapSize);
      break;
  }

  engine.setLayout(layout, { animate, fit: true });
}

function updateLayouts(animate = true) {
  if (state.activeFolderA !== '') renderCanvasPage('A', animate);
  if (state.activeFolderB !== '' && state.isSplit) renderCanvasPage('B', animate);
}

function changePage(canvasId, dir) {
  if (canvasId === 'A') {
    state.pageA += dir;
    renderCanvasPage('A', false);
  } else {
    state.pageB += dir;
    renderCanvasPage('B', false);
  }
}

// Floating Hover Preview Card
let currentHoverPath = '';
function handleInspectHover(hoveredItem, screenX, screenY) {
  if (!hoveredItem || !hoveredItem.item) {
    els.hoverCard.classList.add('hidden');
    currentHoverPath = '';
    return;
  }

  const item = hoveredItem.item;
  if (currentHoverPath !== item.fullPath) {
    currentHoverPath = item.fullPath;
    els.hcName.textContent = item.name;
    els.hcPath.textContent = item.fullPath;

    // Load thumbnail preview (essential when hovering dots in Point Cloud mode!)
    els.hcThumb.src = '';
    state.datasetHandler.getBlobUrl(item).then((url) => {
      if (currentHoverPath === item.fullPath) {
        els.hcThumb.src = url;
      }
    });

    // Badges
    const badges = [];
    if (item.clusterId !== null && item.clusterId !== undefined) {
      const col = getClusterColor(item.clusterId);
      badges.push(
        `<span class="mini-badge" style="border-color:${col};color:${col}">C${item.clusterId + 1}</span>`
      );
    }
    if (item.analysis?.photo) {
      badges.push(`<span class="mini-badge">${item.analysis.photo.exposureStatus}</span>`);
      badges.push(`<span class="mini-badge">${item.analysis.photo.sharpnessLabel} (${item.analysis.photo.sharpness})</span>`);
    }
    if (item.ai?.faces?.length) {
      badges.push(`<span class="mini-badge">${item.ai.faces.length} Face${item.ai.faces.length > 1 ? 's' : ''}</span>`);
    }
    if (item.ai?.humans?.length) {
      badges.push(`<span class="mini-badge">${item.ai.humans.length} Person${item.ai.humans.length > 1 ? 's' : ''}</span>`);
    }
    els.hcBadges.innerHTML = badges.join('');

    // Meta rows
    const rows = [];
    if (item.width && item.height) {
      rows.push(['Dimensions', `${item.width} × ${item.height}`]);
    }
    if (item.metadata) {
      const m = imgMetaSummary(item.metadata);
      rows.push(...m);
    }
    els.hcMeta.innerHTML = rows
      .slice(0, 4)
      .map(([k, v]) => `<div class="kv-row"><span class="kv-key">${k}</span><span class="kv-val">${v}</span></div>`)
      .join('');
  }

  els.hoverCard.classList.remove('hidden');
  const cardW = 272;
  const cardH = els.hoverCard.offsetHeight || 240;
  const pad = 16;

  let x = screenX + pad;
  let y = screenY + pad;
  if (x + cardW > window.innerWidth) x = screenX - cardW - pad;
  if (y + cardH > window.innerHeight) y = Math.max(8, window.innerHeight - cardH - pad);

  els.hoverCard.style.left = `${x}px`;
  els.hoverCard.style.top = `${y}px`;
}

function imgMetaSummary(m) {
  const out = [];
  const pred = m.prediction ?? m.pred;
  const label = m.label ?? m.ground_truth ?? m.gt;
  if (label !== undefined) out.push(['Label', String(label)]);
  if (pred !== undefined) out.push(['Prediction', String(pred)]);
  if (m.confidence !== undefined) out.push(['Confidence', Number(m.confidence).toFixed(3)]);
  return out;
}

// Detailed Fullscreen Inspector Modal
async function openImageDetails(item, contextList = []) {
  state.modalItem = item;
  state.modalList = contextList.length > 0 ? contextList : [item];
  state.modalIndex = state.modalList.indexOf(item);

  try {
    const url = await state.datasetHandler.getBlobUrl(item);
    els.modalFilename.textContent = item.name;
    els.modalFilepath.textContent = item.fullPath;

    els.modalImage.onload = () => {
      if (!item.dimensionsLoaded) {
        item.width = els.modalImage.naturalWidth || 200;
        item.height = els.modalImage.naturalHeight || 200;
        item.dimensionsLoaded = true;
      }
      drawModalBboxes(item);
    };
    els.modalImage.src = url;

    populateModalInspector(item);
    els.detailsModal.classList.remove('hidden');

    requestAnimationFrame(() => {
      if (item.analysis?.histograms) {
        drawRgbCurve(els.modalRgbCurve, item.analysis.histograms, state.theme);
      }
      drawModalBboxes(item);
    });
  } catch (err) {
    state.toast.show(`Failed to open image: ${err.message}`, 'error');
  }
}

function populateModalInspector(item) {
  // 1. 5-Color Dominant Palette
  els.modalPaletteRow.innerHTML = '';
  const palette = item.analysis?.palette || [];
  for (const sw of palette) {
    const btn = document.createElement('button');
    btn.className = 'swatch-btn';
    btn.title = `Click to copy ${sw.hex} (${Math.round(sw.ratio * 100)}%)`;
    btn.innerHTML = `
      <span class="swatch-color" style="background:${sw.hex}"></span>
      <span class="swatch-hex">${sw.hex}</span>
    `;
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(sw.hex);
      state.toast.show(`Copied ${sw.hex} to clipboard`, 'success', 2000);
    });
    els.modalPaletteRow.appendChild(btn);
  }

  // 2. Photography & Quality Grid
  const p = item.analysis?.photo;
  const tiles = [
    ['Dimensions', `${item.width || '—'} × ${item.height || '—'}`],
    ['Resolution', p ? `${p.megapixels} MP (${p.resolutionTier})` : '—'],
    ['Exposure', p ? p.exposureStatus : '—'],
    ['Brightness / Contrast', p ? `${p.brightness} / ${p.contrast}` : '—'],
    ['Sharpness (Laplacian)', p ? `${p.sharpness}/100 (${p.sharpnessLabel})` : '—'],
    [
      'Clip (Shadow / High)',
      p ? `${Math.round(p.shadowClip * 100)}% / ${Math.round(p.highlightClip * 100)}%` : '—'
    ],
    ['Color Temp', p ? (p.temperature > 0 ? `+${p.temperature} Warm` : `${p.temperature} Cool`) : '—'],
    ['Aspect Bucket', p ? p.aspectBucket : '—']
  ];
  els.modalPhotoGrid.innerHTML = tiles
    .map(([k, v]) => `<div class="kv-tile"><span>${k}</span><span>${v}</span></div>`)
    .join('');

  // 3. Themes, Cluster, AI Detections & Dataset Metadata
  const metaRows = [];
  if (item.clusterId !== null && item.clusterId !== undefined) {
    metaRows.push(['Cluster', `Cluster ${item.clusterId + 1}`]);
  }
  if (item.analysis?.themes?.length) {
    metaRows.push(['Visual Themes', item.analysis.themes.join(', ')]);
  }
  if (item.ai?.clipThemes?.length) {
    metaRows.push(['CLIP Theme', `${item.ai.clipThemes.join(', ')} (${item.ai.clipTopScore ?? ''})`]);
  }
  if (item.ai?.faces) {
    metaRows.push(['Faces Detected', String(item.ai.faces.length)]);
  }
  if (item.ai?.humans) {
    metaRows.push(['Humans Detected', String(item.ai.humans.length)]);
  }
  if (item.annotations?.length) {
    metaRows.push(['Ground-Truth Boxes', String(item.annotations.length)]);
  }
  if (item.metadata) {
    for (const [k, v] of Object.entries(item.metadata)) {
      if (typeof v !== 'object') {
        metaRows.push([k.replace(/_/g, ' '), String(v)]);
      }
    }
  }

  els.modalMetaList.innerHTML =
    metaRows.length > 0
      ? metaRows
          .map(
            ([k, v]) =>
              `<div class="kv-row" style="padding:3px 0;border-bottom:1px solid var(--border-hairline)"><span class="kv-key">${k}</span><span class="kv-val">${v}</span></div>`
          )
          .join('')
      : '<div class="rail-empty">No external metadata attached.</div>';
}

function drawModalBboxes(item) {
  const canvas = els.modalBboxCanvas;
  const imgEl = els.modalImage;
  if (!canvas || !imgEl) return;

  const w = imgEl.clientWidth;
  const h = imgEl.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!els.modalChkBboxes.checked) return;

  const renderGroup = (boxes, color) => {
    if (!boxes || boxes.length === 0) return;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    for (const b of boxes) {
      const [bx, by, bw, bh] = b.bbox;
      const rx = bx * w;
      const ry = by * h;
      const rw = bw * w;
      const rh = bh * h;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);

      const tag = b.score !== undefined ? `${b.label} ${Math.round(b.score * 100)}%` : b.label;
      const tw = ctx.measureText(tag).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(rx, Math.max(0, ry - 18), tw, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, rx + 4, Math.max(9, ry - 9));
    }
  };

  renderGroup(item.annotations, '#16a34a');
  renderGroup(item.ai?.humans, '#d97706');
  renderGroup(item.ai?.faces, '#2563eb');
}

function stepModalImage(delta) {
  if (!state.modalList || state.modalList.length <= 1) return;
  const nextIdx = (state.modalIndex + delta + state.modalList.length) % state.modalList.length;
  openImageDetails(state.modalList[nextIdx], state.modalList);
}

function closeImageDetails() {
  els.detailsModal.classList.add('hidden');
  els.modalImage.src = '';
  state.modalItem = null;
}

// Unload Dataset (Non-blocking — no window.confirm)
function clearDataset() {
  state.analysisController.cancelActive();
  state.modelManager.cancelRunningScan();

  state.engineA.clear();
  state.engineB.clear();
  state.datasetHandler = new DatasetHandler();
  state.analysisController.summary = null;

  state.engineA.datasetHandler = state.datasetHandler;
  state.engineB.datasetHandler = state.datasetHandler;

  state.activeFolderA = '';
  state.activeFolderB = '';
  state.filteredImagesA = [];
  state.filteredImagesB = [];

  els.fileInput.value = '';
  els.folderInput.value = '';
  els.datasetBadge.textContent = 'No dataset';
  els.btnClearAll.disabled = true;
  els.viewportEmptyCover.classList.remove('hidden');
  els.bgTaskPill.classList.add('hidden');
  els.filterGroupFaces.classList.add('hidden');
  els.filterGroupHumans.classList.add('hidden');
  els.progWrapFace.classList.add('hidden');
  els.progWrapHuman.classList.add('hidden');
  els.progWrapClip.classList.add('hidden');

  resetAllAnalyticalFilters(false);
  els.folderTreeContainer.innerHTML =
    '<div class="rail-empty">Load a folder or archive to browse directories.</div>';
  els.clusterList.innerHTML = '<div class="rail-empty">Clusters appear automatically once loaded.</div>';
  els.colorSpectrumBar.innerHTML = '';
  els.paletteFamilyChips.innerHTML = '';
  els.themeBarsContainer.innerHTML = '<div class="rail-empty">No theme telemetry yet.</div>';
  els.exposureChips.innerHTML = '<div class="rail-empty">Load images to inspect exposure.</div>';
  els.sharpnessChips.innerHTML = '';
  els.resolutionChips.innerHTML = '';
  els.aspectChips.innerHTML = '';
  updateGlobalDashboard();

  state.toast.show('Dataset unloaded.', 'info');
}

function showLoading(msg, submsg) {
  els.loadMsg.textContent = msg;
  els.loadSubmsg.textContent = submsg || '';
  els.loadingOverlay.classList.remove('hidden');
}

function updateLoadingMsg(msg, submsg) {
  els.loadMsg.textContent = msg;
  if (submsg !== undefined) els.loadSubmsg.textContent = submsg;
}

function hideLoading() {
  els.loadingOverlay.classList.add('hidden');
}

init();
