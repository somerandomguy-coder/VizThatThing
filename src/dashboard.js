// Sidebar Dashboard rendering: Folder Tree, KPI Metrics, Clusters, Color Spectrum, Themes & Photo Chips

import { ICONS } from './ui/icons.js';
import { getStringColor } from './packer.js';

/**
 * Renders the reconstructed directory tree using clean SVG icons (zero emojis).
 */
export function renderFolderTree(rootNode, containerEl, onAssign) {
  containerEl.innerHTML = '';

  function setActiveRow(rowEl) {
    containerEl.querySelectorAll('.folder-row').forEach((r) => r.classList.remove('selected'));
    rowEl.classList.add('selected');
  }

  function createRow(label, path, count, depth = 0, isRoot = false) {
    const row = document.createElement('div');
    row.className = `folder-row${isRoot ? ' selected' : ''}`;
    row.style.paddingLeft = `${7 + depth * 12}px`;

    const left = document.createElement('div');
    left.className = 'folder-label-wrap';
    left.innerHTML = `${isRoot ? ICONS.folderOpen : ICONS.folder}<span class="fname"></span>`;
    left.querySelector('.fname').textContent = label;

    const right = document.createElement('div');
    right.className = 'folder-right';

    const cnt = document.createElement('span');
    cnt.className = 'folder-cnt';
    cnt.textContent = count.toLocaleString();

    const assign = document.createElement('div');
    assign.className = 'assign-group';

    const btnA = document.createElement('button');
    btnA.className = 'mini-pill-btn';
    btnA.textContent = 'A';
    btnA.title = 'Load into Viewport A';
    btnA.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveRow(row);
      onAssign(path, 'A');
    });

    const btnB = document.createElement('button');
    btnB.className = 'mini-pill-btn';
    btnB.textContent = 'B';
    btnB.title = 'Load into Viewport B';
    btnB.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveRow(row);
      onAssign(path, 'B');
    });

    assign.appendChild(btnA);
    assign.appendChild(btnB);
    right.appendChild(cnt);
    right.appendChild(assign);

    row.appendChild(left);
    row.appendChild(right);

    row.addEventListener('click', () => {
      setActiveRow(row);
      onAssign(path, 'click');
    });

    return row;
  }

  if (rootNode.totalCount > 0) {
    containerEl.appendChild(createRow('All Images', 'root', rootNode.totalCount, 0, true));
  }

  function walk(node, depth) {
    const names = Object.keys(node.children).sort();
    for (const childName of names) {
      const child = node.children[childName];
      if (child.totalCount <= 0) continue;
      const wrap = document.createElement('div');
      wrap.className = 'folder-node';
      wrap.appendChild(createRow(child.name, child.path, child.totalCount, depth, false));
      walkChildren(child, depth + 1, wrap);
      containerEl.appendChild(wrap);
    }
  }

  function walkChildren(node, depth, parentEl) {
    const names = Object.keys(node.children).sort();
    for (const childName of names) {
      const child = node.children[childName];
      if (child.totalCount <= 0) continue;
      parentEl.appendChild(createRow(child.name, child.path, child.totalCount, depth, false));
      walkChildren(child, depth + 1, parentEl);
    }
  }

  walk(rootNode, 1);
}

/**
 * Computes classification KPI metrics & confidence array.
 */
export function calculateMetrics(images) {
  const total = images.length;
  let correctCount = 0;
  let incorrectCount = 0;
  let hasLabelPredCount = 0;
  const confidences = [];

  for (const img of images) {
    const m = img.metadata;
    if (!m) continue;

    if (m.confidence !== undefined) {
      const conf = Number(m.confidence);
      if (Number.isFinite(conf)) confidences.push(conf);
    }

    const pred = m.prediction ?? m.pred;
    const label = m.label ?? m.ground_truth ?? m.gt;
    if (pred !== undefined && label !== undefined) {
      hasLabelPredCount++;
      if (String(pred) === String(label)) correctCount++;
      else incorrectCount++;
    }
  }

  const accuracy = hasLabelPredCount > 0 ? (correctCount / hasLabelPredCount) * 100 : null;
  return {
    total,
    correctCount,
    incorrectCount,
    hasLabels: hasLabelPredCount > 0,
    accuracy,
    confidences
  };
}

/**
 * Renders interactive K-Means++ cluster list in the Analysis tab.
 */
export function renderClusterList(clusters, activeClusterId, containerEl, onToggleCluster) {
  if (!containerEl) return;
  if (!clusters || clusters.length === 0) {
    containerEl.innerHTML = '<div class="rail-empty">No clusters computed yet.</div>';
    return;
  }

  containerEl.innerHTML = '';
  for (const c of clusters) {
    const row = document.createElement('div');
    row.className = `cluster-row${activeClusterId === c.id ? ' active' : ''}`;
    row.innerHTML = `
      <div class="cluster-row-left">
        <span class="cluster-swatch"></span>
        <span class="cluster-title"></span>
      </div>
      <span class="mono-val">${c.count}</span>
    `;
    row.querySelector('.cluster-swatch').style.background = c.color;
    row.querySelector('.cluster-title').textContent = c.label;
    row.addEventListener('click', () => onToggleCluster(c.id));
    containerEl.appendChild(row);
  }
}

/**
 * Renders dataset-wide Color Spectrum bar & clickable color family chips.
 */
export function renderColorPaletteSection(paletteSummary, activeFamily, barEl, chipsEl, onToggleFamily) {
  if (!barEl || !chipsEl) return;
  barEl.innerHTML = '';
  chipsEl.innerHTML = '';

  if (!paletteSummary || paletteSummary.length === 0) {
    chipsEl.innerHTML = '<div class="rail-empty">Waiting for color extraction...</div>';
    return;
  }

  for (const entry of paletteSummary) {
    const seg = document.createElement('div');
    seg.className = 'spectrum-seg';
    seg.style.width = `${Math.max(2, entry.ratio * 100)}%`;
    seg.style.background = entry.hex;
    seg.title = `${entry.label}: ${entry.count} images`;
    seg.addEventListener('click', () => onToggleFamily(entry.id));
    barEl.appendChild(seg);

    const chip = document.createElement('button');
    chip.className = `filter-chip${activeFamily === entry.id ? ' active' : ''}`;
    chip.innerHTML = `
      <span class="chip-dot" style="background:${entry.hex}"></span>
      <span>${entry.label}</span>
      <span class="chip-cnt">${entry.count}</span>
    `;
    chip.addEventListener('click', () => onToggleFamily(entry.id));
    chipsEl.appendChild(chip);
  }
}

/**
 * Renders horizontal distribution bars for heuristic or CLIP themes.
 */
export function renderThemeBars(themeCounts, totalCount, activeTheme, containerEl, onToggleTheme) {
  if (!containerEl) return;
  const entries = Object.entries(themeCounts || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    containerEl.innerHTML = '<div class="rail-empty">No themes extracted yet.</div>';
    return;
  }

  containerEl.innerHTML = '';
  const maxCnt = Math.max(1, entries[0][1]);

  for (const [theme, count] of entries) {
    const item = document.createElement('div');
    item.className = `theme-bar-item${activeTheme === theme ? ' active' : ''}`;
    const pct = Math.round((count / maxCnt) * 100);
    item.innerHTML = `
      <div class="theme-bar-fill" style="width:${pct}%"></div>
      <span class="theme-bar-name"></span>
      <span class="theme-bar-cnt">${count} (${Math.round((count / Math.max(1, totalCount)) * 100)}%)</span>
    `;
    item.querySelector('.theme-bar-name').textContent = theme;
    item.addEventListener('click', () => onToggleTheme(theme));
    containerEl.appendChild(item);
  }
}

/**
 * Generic clickable filter chips renderer for Exposure, Sharpness, Resolution, and Aspect Ratio.
 */
export function renderMetricChips(countsObj, activeValue, containerEl, onToggle) {
  if (!containerEl) return;
  containerEl.innerHTML = '';
  const entries = Object.entries(countsObj || {});
  if (entries.length === 0) return;

  for (const [label, count] of entries) {
    const btn = document.createElement('button');
    btn.className = `filter-chip${activeValue === label ? ' active' : ''}`;
    btn.innerHTML = `<span>${label}</span><span class="chip-cnt">${count}</span>`;
    btn.addEventListener('click', () => onToggle(label));
    containerEl.appendChild(btn);
  }
}

/**
 * Renders Saved Groups, Hard Cluster Overrides, and Theme Tags in the Explore sidebar.
 */
export function renderCurationChips(curationSummary, activeFilter, containerEl, onToggle) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const entries = [];
  if (curationSummary) {
    for (const [grp, cnt] of Object.entries(curationSummary.groupCounts || {})) {
      entries.push({ key: `group:${grp}`, label: grp, prefix: 'Group', count: cnt, color: getStringColor(grp) });
    }
    for (const [mc, cnt] of Object.entries(curationSummary.manualClusterCounts || {})) {
      entries.push({ key: `cluster:${mc}`, label: mc, prefix: 'Pin', count: cnt, color: getStringColor(mc) });
    }
    for (const [tag, cnt] of Object.entries(curationSummary.tagCounts || {})) {
      entries.push({ key: `tag:${tag}`, label: `#${tag}`, prefix: '', count: cnt, color: getStringColor(`#${tag}`) });
    }
  }

  if (entries.length === 0) {
    containerEl.innerHTML = '<div class="rail-empty">Select photos on canvas to tag or group them.</div>';
    return;
  }

  for (const entry of entries) {
    const btn = document.createElement('button');
    btn.className = `filter-chip${activeFilter === entry.key ? ' active' : ''}`;
    const display = entry.prefix ? `${entry.prefix}: ${entry.label}` : entry.label;
    btn.innerHTML = `
      <span class="chip-dot" style="background:${entry.color}"></span>
      <span></span>
      <span class="chip-cnt">${entry.count}</span>
    `;
    btn.querySelectorAll('span')[1].textContent = display;
    btn.addEventListener('click', () => onToggle(entry.key));
    containerEl.appendChild(btn);
  }
}

