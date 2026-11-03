// Single-CSV project state serialization & hydration for tags, groups, cluster overrides, and custom (x, y) coordinates

function escapeCsvCell(val) {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseTagString(raw) {
  if (!raw && raw !== 0) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((t) => String(t).trim()).filter(Boolean)));
  }
  const str = String(raw).trim();
  if (!str) return [];
  const sep = str.includes(';') ? ';' : str.includes('|') ? '|' : ',';
  const list = str
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(list));
}

/**
 * Applies curation columns (tags, group, cluster_override, custom_x, custom_y) from a parsed CSV/JSON row onto an image item.
 */
export function applyCurationRecord(item, record) {
  if (!item || !record || typeof record !== 'object') return item;

  if (!item.curation) {
    item.curation = { tags: [], group: '', manualCluster: '' };
  }

  // Case-insensitive lookup helper
  const getField = (...names) => {
    for (const n of names) {
      if (record[n] !== undefined) return record[n];
    }
    const lowerMap = {};
    for (const k of Object.keys(record)) {
      lowerMap[k.toLowerCase()] = record[k];
    }
    for (const n of names) {
      if (lowerMap[n.toLowerCase()] !== undefined) return lowerMap[n.toLowerCase()];
    }
    return undefined;
  };

  const rawTags = getField('tags', 'tag', 'theme_tags');
  if (rawTags !== undefined) {
    item.curation.tags = parseTagString(rawTags);
  }

  const rawGroup = getField('group', 'saved_group', 'custom_group');
  if (rawGroup !== undefined) {
    item.curation.group = String(rawGroup ?? '').trim();
  }

  const rawCluster = getField('cluster_override', 'manual_cluster', 'hard_cluster');
  if (rawCluster !== undefined) {
    item.curation.manualCluster = String(rawCluster ?? '').trim();
  }

  const rawX = getField('custom_x', 'pos_x');
  const rawY = getField('custom_y', 'pos_y');
  if (rawX !== undefined && rawY !== undefined && rawX !== '' && rawY !== '') {
    const nx = Number(rawX);
    const ny = Number(rawY);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      item.customPos = { x: nx, y: ny };
    }
  }

  return item;
}

/**
 * Serializes all dataset images (including tags, groups, cluster overrides, and custom positions)
 * into a single portable CSV file.
 */
export function serializeProjectCSV(images) {
  const headers = [
    'filename',
    'full_path',
    'label',
    'prediction',
    'confidence',
    'tags',
    'group',
    'cluster_override',
    'custom_x',
    'custom_y'
  ];

  const rows = [headers.join(',')];

  for (const img of images || []) {
    const meta = img.metadata || {};
    const cur = img.curation || { tags: [], group: '', manualCluster: '' };
    const label = meta.label ?? meta.ground_truth ?? meta.gt ?? '';
    const pred = meta.prediction ?? meta.pred ?? '';
    const conf = meta.confidence ?? meta.score ?? '';
    const tagsStr = Array.isArray(cur.tags) ? cur.tags.join(';') : '';
    const groupStr = cur.group || '';
    const manualCluster = cur.manualCluster || '';
    const cx = img.customPos && Number.isFinite(img.customPos.x) ? Math.round(img.customPos.x) : '';
    const cy = img.customPos && Number.isFinite(img.customPos.y) ? Math.round(img.customPos.y) : '';

    const cells = [
      img.name || '',
      img.fullPath || '',
      label,
      pred,
      conf,
      tagsStr,
      groupStr,
      manualCluster,
      cx,
      cy
    ].map(escapeCsvCell);

    rows.push(cells.join(','));
  }

  return rows.join('\n') + '\n';
}

/**
 * Summarizes user curation tags, groups, manual clusters, and custom positions across the dataset.
 */
export function summarizeCuration(images) {
  const tagCounts = {};
  const groupCounts = {};
  const manualClusterCounts = {};
  let customPosCount = 0;
  let curatedCount = 0;

  for (const img of images || []) {
    const cur = img.curation;
    let hasAny = false;
    if (cur) {
      if (Array.isArray(cur.tags)) {
        for (const t of cur.tags) {
          if (!t) continue;
          tagCounts[t] = (tagCounts[t] || 0) + 1;
          hasAny = true;
        }
      }
      if (cur.group) {
        groupCounts[cur.group] = (groupCounts[cur.group] || 0) + 1;
        hasAny = true;
      }
      if (cur.manualCluster) {
        manualClusterCounts[cur.manualCluster] = (manualClusterCounts[cur.manualCluster] || 0) + 1;
        hasAny = true;
      }
    }
    if (img.customPos && Number.isFinite(img.customPos.x) && Number.isFinite(img.customPos.y)) {
      customPosCount++;
      hasAny = true;
    }
    if (hasAny) curatedCount++;
  }

  return {
    tagCounts,
    groupCounts,
    manualClusterCounts,
    customPosCount,
    curatedCount
  };
}

