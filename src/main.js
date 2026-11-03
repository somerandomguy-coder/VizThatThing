import './style.css';
import { DatasetHandler } from './dataset-handler.js';
import { CanvasEngine } from './canvas-engine.js';
import {
  packLayout,
  justifyLayout,
  scatterLayout,
  clusterIslandsLayout,
  colorMapLayout,
  applyCustomPositions,
  getClusterColor,
  getStringColor
} from './packer.js';
import {
  renderFolderTree,
  calculateMetrics,
  renderClusterList,
  renderColorPaletteSection,
  renderThemeBars,
  renderMetricChips,
  renderCurationChips
} from './dashboard.js';
import { AnalysisController } from './analysis/analysis-controller.js';
import {
  getActiveEmbedding,
  findSimilarToAnchor,
  arrangePulledNeighbors,
  packSelectedSubgroup
} from './analysis/similarity.js';
import {
  serializeProjectCSV,
  parseTagString,
  summarizeCuration
} from './curation/project-csv.js';
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

  // Off-page items pulled onto current page via right-click cosine similarity
  pinnedPathsA: new Set(),
  pinnedPathsB: new Set(),
  pullRingsByAnchor: new Map(),

  filteredImagesA: [],
  filteredImagesB: [],

  // Spatial & Display Modes
  layoutMode: 'pack', // 'pack' | 'grid' | 'pca' | 'umap' | 'clusters' | 'colormap'
  renderStyle: 'sprites', // 'sprites' | 'points'
  colorBy: 'none', // 'none' | 'cluster' | 'group' | 'dominant' | 'prediction' | 'exposure' | 'sharpness'
  showBboxes: true,
  thumbSize: 180,
  gapSize: 6,
  isSplit: false,
  isLinked: false,
  activePanel: 'A',
  selectionPanel: 'A',

  // Curation Popover Initial Snapshot
  popoverInitial: { group: '', tags: '', cluster: '' },

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

  // Analytical, Curation, Photo & AI Filters
  activeCurationFilter: null, // 'group:...' | 'tag:...' | 'cluster:...'
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

  // Full-Resolution Lightbox Modal Context
  modalItem: null,
  modalList: [],
  modalIndex: -1,
  modalFullResUrl: null,
  modalZoom: 1,
  modalPanX: 0,
  modalPanY: 0,
  modalPanning: false,
  modalPanStartX: 0,
  modalPanStartY: 0
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
    'btn-tidy-layout',
    'btn-toggle-bboxes',
    'btn-toggle-split',
    'btn-link-viewports',
    'btn-save-csv',
    'btn-import-csv',
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
    'curation-chips-container',
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
    'select-page-size',
    'btn-prev-page-b',
    'btn-next-page-b',
    'lbl-page-b',
    'selection-bar',
    'sel-count-label',
    'btn-sel-pack',
    'btn-sel-similar',
    'btn-sel-tag',
    'btn-sel-reset',
    'btn-sel-clear',
    'curation-popover',
    'input-cur-group',
    'input-cur-tags',
    'input-cur-cluster',
    'btn-cur-apply',
    'btn-cur-clear',
    'viewport-empty-cover',
    'btn-upload-folder',
    'btn-upload-file',
    'btn-load-sample',
    'file-input',
    'folder-input',
    'csv-input',
    'bg-task-pill',
    'bg-task-msg',
    'bg-task-fill',
    'hover-card',
    'hc-thumb-canvas',
    'hc-name',
    'hc-path',
    'hc-badges',
    'hc-meta',
    'details-modal',
    'modal-stage',
    'modal-res-badge',
    'btn-modal-zoom-fit',
    'btn-modal-zoom-100',
    'modal-zoom-label',
    'modal-stage-viewport',
    'modal-media-wrap',
    'modal-prev',
    'modal-next',
    'modal-image',
    'modal-bbox-canvas',
    'modal-filename',
    'modal-filepath',
    'modal-close',
    'modal-input-group',
    'modal-input-cluster',
    'modal-input-tags',
    'btn-modal-save-curation',
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
    const camel = id.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
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

function getSelectionEngine() {
  return state.selectionPanel === 'B' && state.isSplit ? state.engineB : state.engineA;
}

function hasAnyCustomPositions() {
  return state.datasetHandler.images.some(
    (img) => img.customPos && Number.isFinite(img.customPos.x) && Number.isFinite(img.customPos.y)
  );
}

function syncTidyButtonState() {
  if (els.btnTidyLayout) {
    els.btnTidyLayout.disabled = !hasAnyCustomPositions();
  }
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
      updateLayouts(false);
    });
  });

  // Color By & Bounding Box toggle
  els.selectColorBy.addEventListener('change', (e) => {
    state.colorBy = e.target.value;
    state.engineA.setDisplayOptions({ colorBy: state.colorBy });
    state.engineB.setDisplayOptions({ colorBy: state.colorBy });
  });

  // Tidy Button: snap all dragged/unpacked items back to canonical layout
  els.btnTidyLayout.addEventListener('click', handleTidyLayout);

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

  // Dataset Load & Project CSV Controls
  els.btnUploadFile.addEventListener('click', () => els.fileInput.click());
  els.btnHeaderOpen.addEventListener('click', () => els.folderInput.click());
  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleZipFile(e.target.files[0]);
  });

  els.btnUploadFolder.addEventListener('click', () => els.folderInput.click());
  els.folderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFolderUpload(e.target.files);
  });

  els.btnSaveCsv.addEventListener('click', handleSaveProjectCSV);
  els.btnImportCsv.addEventListener('click', () => els.csvInput.click());
  els.csvInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await handleImportCSVFile(e.target.files[0]);
      els.csvInput.value = '';
    }
  });

  els.btnLoadSample.addEventListener('click', handleLoadSampleDataset);
  els.btnClearAll.addEventListener('click', clearDataset);

  // Drag & Drop ZIP or Project CSV
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    els.dropOverlay.classList.add('dragover');
  });
  els.dropOverlay.addEventListener('dragover', (e) => e.preventDefault());
  els.dropOverlay.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.relatedTarget === null) els.dropOverlay.classList.remove('dragover');
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    els.dropOverlay.classList.remove('dragover');
    const files = Array.from(e.dataTransfer?.files || []);
    const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'));
    const csvFile = files.find((f) => /\.(csv|tsv)$/i.test(f.name));
    if (zipFile) {
      await handleZipFile(zipFile);
    } else if (csvFile && state.datasetHandler.isLoaded) {
      await handleImportCSVFile(csvFile);
    } else if (files.length > 0) {
      state.toast.show('Drop a .zip archive (or a project .csv onto an open dataset), or click Select Folder.', 'info');
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

  els.selectPageSize.addEventListener('change', (e) => {
    const val = Number(e.target.value);
    if (Number.isFinite(val) && val > 0) {
      state.pageSize = val;
      state.pageA = 1;
      state.pageB = 1;
      updateLayouts(false);
    }
  });

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

  // Spatial Canvas Callbacks: Hover, Double-Click Lightbox, Right-Click Cosine Pull, Marquee Selection & Custom Drag
  state.engineA.onHoverChange = (item, x, y) => handleInspectHover(item, x, y);
  state.engineB.onHoverChange = (item, x, y) => handleInspectHover(item, x, y);

  state.engineA.onItemDoubleClick = (li) => openImageDetails(li.item, state.filteredImagesA);
  state.engineB.onItemDoubleClick = (li) => openImageDetails(li.item, state.filteredImagesB);

  state.engineA.onItemRightClick = (li) => pullSimilarNeighbors('A', li);
  state.engineB.onItemRightClick = (li) => pullSimilarNeighbors('B', li);

  state.engineA.onSelectionChange = (selected, bounds) => handleEngineSelectionChange('A', selected, bounds);
  state.engineB.onSelectionChange = (selected, bounds) => handleEngineSelectionChange('B', selected, bounds);

  state.engineA.onCustomPositionsChange = () => {
    state.pullRingsByAnchor.clear();
    syncTidyButtonState();
  };
  state.engineB.onCustomPositionsChange = () => {
    state.pullRingsByAnchor.clear();
    syncTidyButtonState();
  };

  // Floating Selection Bar & Curation Popover Actions
  els.btnSelPack.addEventListener('click', handlePackSelection);
  els.btnSelSimilar.addEventListener('click', () => {
    const engine = getSelectionEngine();
    const sel = engine.getSelectedLayoutItems();
    if (sel.length > 0) {
      pullSimilarNeighbors(state.selectionPanel, sel[sel.length - 1]);
    }
  });
  els.btnSelTag.addEventListener('click', toggleCurationPopover);
  els.btnSelReset.addEventListener('click', handleResetSelectedPositions);
  els.btnSelClear.addEventListener('click', () => {
    els.curationPopover.classList.add('hidden');
    getSelectionEngine().clearSelection();
  });

  els.btnCurApply.addEventListener('click', handleApplySelectionCuration);
  els.btnCurClear.addEventListener('click', handleClearSelectionCuration);

  // Full-Resolution Lightbox Modal Events
  els.modalClose.addEventListener('click', closeImageDetails);
  els.detailsModal.addEventListener('click', (e) => {
    if (e.target === els.detailsModal) closeImageDetails();
  });
  els.modalPrev.addEventListener('click', () => stepModalImage(-1));
  els.modalNext.addEventListener('click', () => stepModalImage(1));
  els.modalChkBboxes.addEventListener('change', () => {
    if (state.modalItem) drawModalBboxes(state.modalItem);
  });

  els.btnModalZoomFit.addEventListener('click', () => setModalZoomPreset('fit'));
  els.btnModalZoom100.addEventListener('click', () => setModalZoomPreset('100'));
  els.btnModalSaveCuration.addEventListener('click', handleSaveModalCuration);

  els.modalStageViewport.addEventListener(
    'wheel',
    (e) => {
      if (els.detailsModal.classList.contains('hidden')) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      state.modalZoom = Math.max(0.5, Math.min(8, state.modalZoom * factor));
      if (Math.abs(state.modalZoom - 1) < 0.03) {
        state.modalZoom = 1;
        state.modalPanX = 0;
        state.modalPanY = 0;
      }
      applyModalTransform();
    },
    { passive: false }
  );

  els.modalStageViewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    state.modalPanning = true;
    state.modalPanStartX = e.clientX - state.modalPanX;
    state.modalPanStartY = e.clientY - state.modalPanY;
    els.modalStageViewport.classList.add('panning');
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.modalPanning) return;
    state.modalPanX = e.clientX - state.modalPanStartX;
    state.modalPanY = e.clientY - state.modalPanStartY;
    applyModalTransform();
  });

  window.addEventListener('mouseup', () => {
    if (state.modalPanning) {
      state.modalPanning = false;
      els.modalStageViewport.classList.remove('panning');
    }
  });

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (!els.detailsModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeImageDetails();
      else if (!inInput && e.key === 'ArrowLeft') stepModalImage(-1);
      else if (!inInput && e.key === 'ArrowRight') stepModalImage(1);
      return;
    }

    if (inInput) return;

    if (e.key === 'Escape') {
      els.curationPopover.classList.add('hidden');
      state.engineA.clearSelection();
      state.engineB.clearSelection();
    } else if (e.key === 'p' || e.key === 'P') {
      const sel = getSelectionEngine().getSelectedLayoutItems();
      if (sel.length >= 2) {
        e.preventDefault();
        handlePackSelection();
      }
    }
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

// ============================================================================
// Spatial Curation: Selection Pill, Local Bin-Pack, Cosine Pull & Tidy
// ============================================================================

function handleEngineSelectionChange(panelId, selected, bounds) {
  if (selected.length > 0) {
    state.selectionPanel = panelId;
    const otherEngine = panelId === 'A' ? state.engineB : state.engineA;
    if (otherEngine.selectedPaths.size > 0) {
      otherEngine.selectedPaths.clear();
      otherEngine.draw();
    }
  } else if (state.selectionPanel !== panelId) {
    return;
  }

  if (!selected || selected.length === 0 || !bounds) {
    els.selectionBar.classList.add('hidden');
    els.curationPopover.classList.add('hidden');
    return;
  }

  els.selCountLabel.textContent = `${selected.length} selected`;
  els.btnSelPack.disabled = selected.length < 2;
  els.btnSelReset.disabled = !selected.some((li) => Boolean(li.item.customPos));
  els.selectionBar.classList.remove('hidden');

  const barW = els.selectionBar.offsetWidth || 430;
  const minLeft = barW / 2 + 12;
  const maxLeft = Math.max(minLeft, window.innerWidth - barW / 2 - 12);
  const clampedX = Math.max(minLeft, Math.min(maxLeft, bounds.centerX));
  const clampedY = Math.max(88, Math.min(window.innerHeight - 60, bounds.top - 10));

  els.selectionBar.style.left = `${Math.round(clampedX)}px`;
  els.selectionBar.style.top = `${Math.round(clampedY)}px`;
}

function getEffectiveThumbSizeForLayout() {
  switch (state.layoutMode) {
    case 'grid':
      return Math.round(state.thumbSize * 0.76);
    case 'pca':
    case 'umap':
      return Math.min(130, Math.round(state.thumbSize * 0.65));
    case 'clusters':
      return Math.min(140, Math.round(state.thumbSize * 0.72));
    case 'colormap':
      return Math.min(130, Math.round(state.thumbSize * 0.62));
    case 'pack':
    default:
      return state.thumbSize;
  }
}

function handlePackSelection() {
  const engine = getSelectionEngine();
  const selected = engine.getSelectedLayoutItems();
  if (selected.length < 2) return;

  const packThumb = getEffectiveThumbSizeForLayout();
  const placements = packSelectedSubgroup(selected, packThumb, Math.max(6, state.gapSize));
  engine.animateItemsToTargets(placements);
  syncTidyButtonState();
  state.toast.show(`Bin-packed ${placements.length} selected photos with zero overlap.`, 'success', 2400);
}

function handleResetSelectedPositions() {
  const engine = getSelectionEngine();
  const selected = engine.getSelectedLayoutItems();
  if (selected.length === 0) return;

  if (engine.animFrame) {
    cancelAnimationFrame(engine.animFrame);
    engine.animFrame = null;
  }

  engine.fromPositions.clear();
  for (const li of engine.layout.items) {
    engine.fromPositions.set(li.item.fullPath, {
      x: li.curX ?? li.x,
      y: li.curY ?? li.y,
      w: li.curW ?? li.w,
      h: li.curH ?? li.h,
      pointX: li.curPX ?? li.pointX,
      pointY: li.curPY ?? li.pointY
    });
  }

  for (const li of selected) {
    li.item.customPos = null;
    if (li.baseX !== undefined && li.baseY !== undefined) {
      li.x = li.baseX;
      li.y = li.baseY;
      li.pointX = li.basePointX ?? li.x + li.w / 2;
      li.pointY = li.basePointY ?? li.y + li.h / 2;
    }
  }

  engine.runTransitionAnimation(true);
  syncTidyButtonState();
  engine.notifySelectionChange();
}

function handleTidyLayout() {
  if (!hasAnyCustomPositions()) return;

  for (const img of state.datasetHandler.images) {
    img.customPos = null;
  }
  state.pinnedPathsA.clear();
  state.pinnedPathsB.clear();
  state.pullRingsByAnchor.clear();

  state.engineA.clearSelection();
  state.engineB.clearSelection();
  syncTidyButtonState();
  updateLayouts(true);
  state.toast.show('Snapped all photos back to canonical layout.', 'info', 2200);
}

async function pullSimilarNeighbors(canvasId, anchorLayoutItem) {
  if (!anchorLayoutItem || !anchorLayoutItem.item) return;
  const anchorItem = anchorLayoutItem.item;
  const engine = canvasId === 'A' ? state.engineA : state.engineB;

  const anchorVec = getActiveEmbedding(anchorItem, state.embeddingSource);
  if (!anchorVec) {
    state.toast.show('Visual embeddings are still computing — try right-clicking again in a moment.', 'info');
    return;
  }

  const baseThumb = Math.max(
    anchorLayoutItem.curW ?? anchorLayoutItem.w ?? 120,
    anchorLayoutItem.curH ?? anchorLayoutItem.h ?? 120,
    getEffectiveThumbSizeForLayout()
  );
  const step = baseThumb + Math.max(6, state.gapSize) * 1.5;

  const prevRings = state.pullRingsByAnchor.get(anchorItem.fullPath) || 0;
  const effectiveRadius = (1.65 + Math.min(4, prevRings) * 1.25) * step;

  const layoutLookup = new Map(engine.layout.items.map((li) => [li.item.fullPath, li]));
  const matches = findSimilarToAnchor(anchorItem, state.datasetHandler.images, layoutLookup, {
    count: 5,
    neighborRadius: effectiveRadius,
    embeddingSource: state.embeddingSource
  });

  if (matches.length === 0) {
    state.toast.show('All cosine-similar photos are already gathered around this image.', 'info', 2600);
    return;
  }

  const pulledItems = matches.map((m) => m.item);
  const pinnedSet = canvasId === 'A' ? state.pinnedPathsA : state.pinnedPathsB;

  let addedOffPage = false;
  for (const item of pulledItems) {
    if (!layoutLookup.has(item.fullPath)) {
      pinnedSet.add(item.fullPath);
      addedOffPage = true;
    }
  }

  await state.datasetHandler.loadBatchDimensions(pulledItems);

  if (addedOffPage) {
    await renderCanvasPage(canvasId, false, false);
  }

  const liveAnchor =
    engine.layout.items.find((li) => li.item.fullPath === anchorItem.fullPath) || anchorLayoutItem;
  const anchorBox = {
    x: Math.round(liveAnchor.curX ?? liveAnchor.x),
    y: Math.round(liveAnchor.curY ?? liveAnchor.y),
    w: liveAnchor.curW ?? liveAnchor.w ?? baseThumb,
    h: liveAnchor.curH ?? liveAnchor.h ?? baseThumb
  };

  // Avoid colliding with previously pulled/dragged customPos items so rings expand cleanly around the anchor
  const pulledSet = new Set(pulledItems.map((it) => it.fullPath));
  const acx = anchorBox.x + anchorBox.w / 2;
  const acy = anchorBox.y + anchorBox.h / 2;
  const occRadiusSq = Math.pow(step * 5.5, 2);

  const occupiedBoxes = [];
  for (const li of engine.layout.items) {
    if (li.item.fullPath === anchorItem.fullPath || pulledSet.has(li.item.fullPath)) continue;
    if (!li.item.customPos) continue;
    const lx = li.curX ?? li.x;
    const ly = li.curY ?? li.y;
    const lw = li.curW ?? li.w;
    const lh = li.curH ?? li.h;
    const dx = lx + lw / 2 - acx;
    const dy = ly + lh / 2 - acy;
    if (dx * dx + dy * dy > occRadiusSq) continue;

    occupiedBoxes.push({ x: lx, y: ly, w: lw, h: lh });
  }

  const placements = arrangePulledNeighbors(
    anchorBox,
    pulledItems,
    occupiedBoxes,
    getEffectiveThumbSizeForLayout(),
    Math.max(8, state.gapSize)
  );

  state.pullRingsByAnchor.set(anchorItem.fullPath, prevRings + 1);
  engine.animateItemsToTargets(placements);
  // Keep pullRingsByAnchor intact across this programmatic animation
  state.pullRingsByAnchor.set(anchorItem.fullPath, prevRings + 1);

  engine.setSelectedPaths([anchorItem.fullPath, ...pulledItems.map((it) => it.fullPath)]);
  syncTidyButtonState();

  const avgSim = matches.reduce((s, m) => s + m.similarity, 0) / matches.length;
  state.toast.show(
    `Pulled ${matches.length} similar photo${matches.length > 1 ? 's' : ''} (avg cos ${avgSim.toFixed(2)})`,
    'success',
    2500
  );
}

// ============================================================================
// Tagging, Grouping, Hard Cluster Overrides & Single-CSV Save / Load
// ============================================================================

function toggleCurationPopover() {
  const isHidden = els.curationPopover.classList.contains('hidden');
  if (!isHidden) {
    els.curationPopover.classList.add('hidden');
    return;
  }

  const selected = getSelectionEngine().getSelectedLayoutItems();
  if (selected.length === 0) return;

  const groups = new Set(selected.map((li) => li.item.curation?.group || ''));
  const clusters = new Set(selected.map((li) => li.item.curation?.manualCluster || ''));
  const tagStrings = new Set(selected.map((li) => (li.item.curation?.tags || []).join('; ')));

  const initGroup = groups.size === 1 ? Array.from(groups)[0] : '';
  const initCluster = clusters.size === 1 ? Array.from(clusters)[0] : '';
  const initTags = tagStrings.size === 1 ? Array.from(tagStrings)[0] : '';

  state.popoverInitial = { group: initGroup, tags: initTags, cluster: initCluster };
  els.inputCurGroup.value = initGroup;
  els.inputCurCluster.value = initCluster;
  els.inputCurTags.value = initTags;

  els.inputCurGroup.placeholder = groups.size > 1 ? '(mixed — type to set)' : 'e.g. hero-set, outliers';
  els.inputCurCluster.placeholder =
    clusters.size > 1 ? '(mixed — type to set)' : 'e.g. Cluster A (optional)';
  els.inputCurTags.placeholder =
    tagStrings.size > 1 ? '(mixed — type to set)' : 'e.g. night; wet-road; sharp';

  els.curationPopover.classList.remove('hidden');
  els.inputCurGroup.focus();
}

function handleApplySelectionCuration() {
  const engine = getSelectionEngine();
  const selected = engine.getSelectedLayoutItems();
  if (selected.length === 0) return;

  const nextGroup = els.inputCurGroup.value.trim();
  const nextTagsRaw = els.inputCurTags.value.trim();
  const nextCluster = els.inputCurCluster.value.trim();

  const groupChanged = nextGroup !== state.popoverInitial.group;
  const tagsChanged = nextTagsRaw !== state.popoverInitial.tags;
  const clusterChanged = nextCluster !== state.popoverInitial.cluster;

  for (const li of selected) {
    if (!li.item.curation) {
      li.item.curation = { tags: [], group: '', manualCluster: '' };
    }
    if (groupChanged) li.item.curation.group = nextGroup;
    if (tagsChanged) li.item.curation.tags = parseTagString(nextTagsRaw);
    if (clusterChanged) li.item.curation.manualCluster = nextCluster;
  }

  els.curationPopover.classList.add('hidden');
  refreshCurationSidebar();

  if (clusterChanged && state.layoutMode === 'clusters') {
    updateLayouts(true);
  } else if (state.activeCurationFilter) {
    handleFiltersChange();
  } else {
    state.engineA.draw();
    state.engineB.draw();
  }

  state.toast.show(`Updated labels on ${selected.length} photo${selected.length > 1 ? 's' : ''}.`, 'success', 2200);
}

function handleClearSelectionCuration() {
  const engine = getSelectionEngine();
  const selected = engine.getSelectedLayoutItems();
  if (selected.length === 0) return;

  for (const li of selected) {
    li.item.curation = { tags: [], group: '', manualCluster: '' };
  }

  els.curationPopover.classList.add('hidden');
  refreshCurationSidebar();

  if (state.layoutMode === 'clusters') {
    updateLayouts(true);
  } else if (state.activeCurationFilter) {
    handleFiltersChange();
  } else {
    state.engineA.draw();
    state.engineB.draw();
  }

  state.toast.show(`Cleared labels on ${selected.length} photo${selected.length > 1 ? 's' : ''}.`, 'info', 2200);
}

function refreshCurationSidebar() {
  const curSummary = summarizeCuration(state.datasetHandler.images);
  renderCurationChips(
    curSummary,
    state.activeCurationFilter,
    els.curationChipsContainer,
    (filterKey) => {
      state.activeCurationFilter = state.activeCurationFilter === filterKey ? null : filterKey;
      refreshCurationSidebar();
      handleFiltersChange();
    }
  );
}

function handleSaveProjectCSV() {
  if (!state.datasetHandler.isLoaded || state.datasetHandler.images.length === 0) return;

  const csvContent = serializeProjectCSV(state.datasetHandler.images);
  const safeName = (state.datasetHandler.datasetName || 'dataset')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const filename = `${safeName || 'dataset'}_vizproject.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const cur = summarizeCuration(state.datasetHandler.images);
  state.toast.show(
    `Saved ${filename} (${cur.curatedCount} curated / ${state.datasetHandler.images.length} total).`,
    'success',
    3000
  );
}

async function handleImportCSVFile(file) {
  try {
    const text = await file.text();
    const res = state.datasetHandler.importExternalCSV(text);
    const matched = res?.matchedCount ?? 0;
    refreshCurationSidebar();
    syncTidyButtonState();
    updateGlobalDashboard();
    updateLayouts(true);
    state.toast.show(`Mapped ${matched} image records from ${file.name}.`, 'success', 2800);
  } catch (err) {
    state.toast.show(`Failed to parse CSV: ${err.message}`, 'error');
  }
}

// ============================================================================
// Dataset Ingestion Flows
// ============================================================================

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

async function finalizeDatasetMount(tree) {
  hideLoading();
  state.analysisController.cancelActive();
  state.modelManager.cancelRunningScan();

  if (state.datasetHandler.images.length === 0) {
    state.toast.show('No supported images (.png, .jpg, .webp, .bmp, .gif) found in dataset.', 'error');
    return;
  }

  state.pinnedPathsA.clear();
  state.pinnedPathsB.clear();
  state.pullRingsByAnchor.clear();

  resetAllAnalyticalFilters(false);
  els.viewportEmptyCover.classList.add('hidden');
  els.btnClearAll.disabled = false;
  els.btnSaveCsv.disabled = false;
  els.btnImportCsv.disabled = false;
  els.datasetBadge.textContent = `${state.datasetHandler.datasetName} (${state.datasetHandler.images.length})`;

  state.activeFolderA = 'root';
  state.activeFolderB = state.isSplit ? 'root' : '';
  state.pageA = 1;
  state.pageB = 1;

  renderFolderTree(tree, els.folderTreeContainer, assignFolderToCanvas);
  refreshCurationSidebar();
  syncTidyButtonState();
  updateGlobalDashboard();

  els.bgTaskPill.classList.remove('hidden');
  els.bgTaskMsg.textContent = 'Indexing dimensions & queuing analytics...';
  els.bgTaskFill.style.width = '2%';

  await loadFolderIntoCanvas('root', 'A');
  if (state.isSplit) {
    await loadFolderIntoCanvas('root', 'B');
  }

  const curSummary = summarizeCuration(state.datasetHandler.images);
  if (curSummary.curatedCount > 0) {
    state.toast.show(
      `Restored saved tags/positions for ${curSummary.curatedCount} photos from project CSV.`,
      'success',
      3200
    );
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
    state.pinnedPathsA.clear();
    els.titlePathA.textContent = folderPath === 'root' ? 'All Images' : folderPath;
    await applyFiltersAndLayout('A');
  } else {
    state.activeFolderB = folderPath;
    state.pageB = 1;
    state.pinnedPathsB.clear();
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
  if (state.activeCurationFilter !== null) c++;
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
  state.activeCurationFilter = null;
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

  els.filterGroupFaces
    .querySelectorAll('.filter-chip')
    .forEach((b, i) => b.classList.toggle('active', i === 0));
  els.filterGroupHumans
    .querySelectorAll('.filter-chip')
    .forEach((b, i) => b.classList.toggle('active', i === 0));

  if (rerender) {
    refreshCurationSidebar();
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

    // 2. Search query across name, path, curation tags/group/cluster, metadata, themes
    if (query) {
      let hit = img.name.toLowerCase().includes(query) || img.fullPath.toLowerCase().includes(query);
      if (!hit && img.curation) {
        if (img.curation.group?.toLowerCase().includes(query)) hit = true;
        if (!hit && img.curation.manualCluster?.toLowerCase().includes(query)) hit = true;
        if (!hit && img.curation.tags?.some((t) => t.toLowerCase().includes(query))) hit = true;
      }
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

    // 3. Saved Group / Tag / Hard Cluster chip filter
    if (state.activeCurationFilter) {
      const cur = img.curation || { tags: [], group: '', manualCluster: '' };
      if (state.activeCurationFilter.startsWith('group:')) {
        if (cur.group !== state.activeCurationFilter.slice(6)) return false;
      } else if (state.activeCurationFilter.startsWith('cluster:')) {
        if (cur.manualCluster !== state.activeCurationFilter.slice(8)) return false;
      } else if (state.activeCurationFilter.startsWith('tag:')) {
        const wanted = state.activeCurationFilter.slice(4);
        if (!Array.isArray(cur.tags) || !cur.tags.includes(wanted)) return false;
      }
    }

    // 4. Prediction correctness
    if (canvasFilter === 'correct' || canvasFilter === 'incorrect') {
      if (!img.metadata) return false;
      const pred = img.metadata.prediction ?? img.metadata.pred;
      const label = img.metadata.label ?? img.metadata.ground_truth ?? img.metadata.gt;
      if (pred === undefined || label === undefined) return false;
      const isOk = String(pred) === String(label);
      if (canvasFilter === 'correct' && !isOk) return false;
      if (canvasFilter === 'incorrect' && isOk) return false;
    }

    // 5. Cluster, Color & Theme filters
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

    // 6. Photography & Quality filters
    if (img.analysis?.photo) {
      const p = img.analysis.photo;
      if (state.activeExposure && p.exposureStatus !== state.activeExposure) return false;
      if (state.activeSharpnessLabel && p.sharpnessLabel !== state.activeSharpnessLabel) return false;
      if (state.activeResolution && p.resolutionTier !== state.activeResolution) return false;
      if (state.activeAspect && p.aspectBucket !== state.activeAspect) return false;
      if (p.brightness < state.minBrightness || p.brightness > state.maxBrightness) return false;
      if (p.sharpness < state.minSharpness) return false;
    }

    // 7. AI Face & Human filters
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
    await renderCanvasPage('A', true, true);
  } else {
    state.filteredImagesB = filtered;
    els.infoCountB.textContent = `${filtered.length.toLocaleString()} items`;
    await renderCanvasPage('B', true, true);
  }
}

async function renderCanvasPage(canvasId, animate = true, fit = true) {
  const images = canvasId === 'A' ? state.filteredImagesA : state.filteredImagesB;
  const engine = canvasId === 'A' ? state.engineA : state.engineB;
  const pinnedSet = canvasId === 'A' ? state.pinnedPathsA : state.pinnedPathsB;

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

    // Append any off-page items pulled onto this page via right-click cosine similarity
    if (pinnedSet.size > 0) {
      const present = new Set(activeSlice.map((im) => im.fullPath));
      const extras = state.datasetHandler.images.filter(
        (im) => pinnedSet.has(im.fullPath) && !present.has(im.fullPath)
      );
      if (extras.length > 0) {
        activeSlice = [...activeSlice, ...extras];
      }
    }
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

  layout = applyCustomPositions(layout);
  engine.setLayout(layout, { animate, fit });
}

function updateLayouts(animate = true, fit = true) {
  if (state.activeFolderA !== '') renderCanvasPage('A', animate, fit);
  if (state.activeFolderB !== '' && state.isSplit) renderCanvasPage('B', animate, fit);
}

function changePage(canvasId, dir) {
  if (canvasId === 'A') {
    state.pageA += dir;
    state.pinnedPathsA.clear();
    renderCanvasPage('A', false, true);
  } else {
    state.pageB += dir;
    state.pinnedPathsB.clear();
    renderCanvasPage('B', false, true);
  }
}

// ============================================================================
// Floating Hover Preview Card (256px Cached Thumbnail — Zero Full-Res Leak)
// ============================================================================

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

    const hcCanvas = els.hcThumbCanvas;
    const hctx = hcCanvas.getContext('2d');
    hctx.clearRect(0, 0, hcCanvas.width, hcCanvas.height);

    state.datasetHandler
      .getThumbnailDrawable(item, 256)
      .then((drawable) => {
        if (currentHoverPath !== item.fullPath || !drawable) return;
        const dw = drawable.width || 200;
        const dh = drawable.height || 140;
        const scale = Math.min(256 / dw, 140 / dh, 1);
        const cw = Math.max(1, Math.round(dw * scale));
        const ch = Math.max(1, Math.round(dh * scale));
        hcCanvas.width = cw;
        hcCanvas.height = ch;
        hcCanvas.getContext('2d').drawImage(drawable, 0, 0, cw, ch);
      })
      .catch(() => {});

    // Badges
    const badges = [];
    if (item.curation?.group) {
      const gCol = getStringColor(item.curation.group);
      badges.push(
        `<span class="mini-badge" style="border-color:${gCol};color:${gCol}">${escapeHtml(item.curation.group)}</span>`
      );
    }
    if (item.curation?.manualCluster) {
      const mcCol = getStringColor(item.curation.manualCluster);
      badges.push(
        `<span class="mini-badge" style="border-color:${mcCol};color:${mcCol}">Pin: ${escapeHtml(item.curation.manualCluster)}</span>`
      );
    } else if (item.clusterId !== null && item.clusterId !== undefined) {
      const col = getClusterColor(item.clusterId);
      badges.push(
        `<span class="mini-badge" style="border-color:${col};color:${col}">C${item.clusterId + 1}</span>`
      );
    }
    if (item.curation?.tags?.length) {
      for (const t of item.curation.tags.slice(0, 3)) {
        badges.push(`<span class="mini-badge">#${escapeHtml(t)}</span>`);
      }
    }
    if (item.analysis?.photo) {
      badges.push(`<span class="mini-badge">${item.analysis.photo.exposureStatus}</span>`);
      badges.push(
        `<span class="mini-badge">${item.analysis.photo.sharpnessLabel} (${item.analysis.photo.sharpness})</span>`
      );
    }
    if (item.ai?.faces?.length) {
      badges.push(
        `<span class="mini-badge">${item.ai.faces.length} Face${item.ai.faces.length > 1 ? 's' : ''}</span>`
      );
    }
    if (item.ai?.humans?.length) {
      badges.push(
        `<span class="mini-badge">${item.ai.humans.length} Person${item.ai.humans.length > 1 ? 's' : ''}</span>`
      );
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
      .map(
        ([k, v]) =>
          `<div class="kv-row"><span class="kv-key">${escapeHtml(k)}</span><span class="kv-val">${escapeHtml(v)}</span></div>`
      )
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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// ============================================================================
// Double-Click Full-Resolution Lightbox & Inspector Modal
// ============================================================================

function revokeModalFullResUrl() {
  if (state.modalFullResUrl) {
    URL.revokeObjectURL(state.modalFullResUrl);
    state.modalFullResUrl = null;
  }
}

function applyModalTransform() {
  els.modalMediaWrap.style.transform = `translate(${Math.round(state.modalPanX)}px, ${Math.round(state.modalPanY)}px) scale(${state.modalZoom.toFixed(3)})`;
  els.modalZoomLabel.textContent = `${Math.round(state.modalZoom * 100)}%`;

  const isFit = Math.abs(state.modalZoom - 1) < 0.03 && Math.hypot(state.modalPanX, state.modalPanY) < 3;
  els.btnModalZoomFit.classList.toggle('active', isFit);
  els.btnModalZoom100.classList.toggle('active', !isFit && state.modalZoom > 1.02);
}

function setModalZoomPreset(preset) {
  if (preset === '100' && els.modalImage.naturalWidth > 0 && els.modalImage.clientWidth > 0) {
    const ratio = els.modalImage.naturalWidth / els.modalImage.clientWidth;
    state.modalZoom = Math.max(1, Math.min(8, ratio));
    state.modalPanX = 0;
    state.modalPanY = 0;
  } else {
    state.modalZoom = 1;
    state.modalPanX = 0;
    state.modalPanY = 0;
  }
  applyModalTransform();
}

async function openImageDetails(item, contextList = []) {
  state.modalItem = item;
  state.modalList = contextList.length > 0 ? contextList : [item];
  state.modalIndex = state.modalList.indexOf(item);

  revokeModalFullResUrl();
  state.modalZoom = 1;
  state.modalPanX = 0;
  state.modalPanY = 0;
  applyModalTransform();

  try {
    const fullUrl = await state.datasetHandler.getFullResObjectUrl(item);
    // Guard against rapid navigation race
    if (state.modalItem !== item) {
      URL.revokeObjectURL(fullUrl);
      return;
    }
    state.modalFullResUrl = fullUrl;

    els.modalFilename.textContent = item.name;
    els.modalFilepath.textContent = item.fullPath;
    els.modalResBadge.textContent =
      item.width && item.height ? `${item.width} × ${item.height} · Full Resolution` : 'Loading Full Resolution...';

    // Populate inline curation editors
    els.modalInputGroup.value = item.curation?.group || '';
    els.modalInputCluster.value = item.curation?.manualCluster || '';
    els.modalInputTags.value = (item.curation?.tags || []).join('; ');

    els.modalImage.onload = () => {
      if (state.modalItem !== item) return;
      const nw = els.modalImage.naturalWidth || item.width || 200;
      const nh = els.modalImage.naturalHeight || item.height || 200;
      item.width = nw;
      item.height = nh;
      item.dimensionsLoaded = true;
      els.modalResBadge.textContent = `${nw} × ${nh} · Full Resolution`;
      drawModalBboxes(item);
    };
    els.modalImage.src = fullUrl;

    populateModalInspector(item);
    els.detailsModal.classList.remove('hidden');

    requestAnimationFrame(() => {
      if (item.analysis?.histograms) {
        drawRgbCurve(els.modalRgbCurve, item.analysis.histograms, state.theme);
      }
      drawModalBboxes(item);
    });
  } catch (err) {
    state.toast.show(`Failed to open full-resolution image: ${err.message}`, 'error');
  }
}

function handleSaveModalCuration() {
  if (!state.modalItem) return;
  const item = state.modalItem;
  if (!item.curation) {
    item.curation = { tags: [], group: '', manualCluster: '' };
  }

  const prevCluster = item.curation.manualCluster || '';
  item.curation.group = els.modalInputGroup.value.trim();
  item.curation.manualCluster = els.modalInputCluster.value.trim();
  item.curation.tags = parseTagString(els.modalInputTags.value);

  populateModalInspector(item);
  refreshCurationSidebar();

  if (prevCluster !== item.curation.manualCluster && state.layoutMode === 'clusters') {
    updateLayouts(true);
  } else if (state.activeCurationFilter) {
    handleFiltersChange();
  } else {
    state.engineA.draw();
    state.engineB.draw();
  }

  state.toast.show(`Saved labels for ${item.name}.`, 'success', 2000);
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

  // 3. Curation, Themes, Cluster, AI Detections & Dataset Metadata
  const metaRows = [];
  if (item.curation?.group) {
    metaRows.push(['Saved Group', item.curation.group]);
  }
  if (item.curation?.manualCluster) {
    metaRows.push(['Pinned Cluster', item.curation.manualCluster]);
  } else if (item.clusterId !== null && item.clusterId !== undefined) {
    metaRows.push(['Cluster', `Cluster ${item.clusterId + 1}`]);
  }
  if (item.curation?.tags?.length) {
    metaRows.push(['User Tags', item.curation.tags.join(', ')]);
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
    const internalKeys = new Set([
      'tags',
      'group',
      'cluster_override',
      'custom_x',
      'custom_y'
    ]);
    for (const [k, v] of Object.entries(item.metadata)) {
      if (typeof v !== 'object' && !internalKeys.has(k.toLowerCase())) {
        metaRows.push([k.replace(/_/g, ' '), String(v)]);
      }
    }
  }

  els.modalMetaList.innerHTML =
    metaRows.length > 0
      ? metaRows
          .map(
            ([k, v]) =>
              `<div class="kv-row" style="padding:3px 0;border-bottom:1px solid var(--border-hairline)"><span class="kv-key">${escapeHtml(k)}</span><span class="kv-val">${escapeHtml(v)}</span></div>`
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
  revokeModalFullResUrl();
  els.detailsModal.classList.add('hidden');
  els.modalImage.src = '';
  state.modalItem = null;
}

// ============================================================================
// Unload Dataset (Non-blocking — no window.confirm)
// ============================================================================

function clearDataset() {
  state.analysisController.cancelActive();
  state.modelManager.cancelRunningScan();
  closeImageDetails();

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
  state.pinnedPathsA.clear();
  state.pinnedPathsB.clear();
  state.pullRingsByAnchor.clear();

  els.fileInput.value = '';
  els.folderInput.value = '';
  els.csvInput.value = '';
  els.datasetBadge.textContent = 'No dataset';
  els.btnClearAll.disabled = true;
  els.btnSaveCsv.disabled = true;
  els.btnImportCsv.disabled = true;
  els.btnTidyLayout.disabled = true;
  els.selectionBar.classList.add('hidden');
  els.curationPopover.classList.add('hidden');
  els.viewportEmptyCover.classList.remove('hidden');
  els.bgTaskPill.classList.add('hidden');
  els.filterGroupFaces.classList.add('hidden');
  els.filterGroupHumans.classList.add('hidden');
  els.progWrapFace.classList.add('hidden');
  els.progWrapHuman.classList.add('hidden');
  els.progWrapClip.classList.add('hidden');

  resetAllAnalyticalFilters(false);
  els.curationChipsContainer.innerHTML =
    '<div class="rail-empty">Select photos on canvas to tag or group them.</div>';
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
