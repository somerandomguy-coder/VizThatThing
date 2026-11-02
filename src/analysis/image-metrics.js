// Pure pixel, color, theme, and photography quality extractor (runs in Worker or Node tests)

export const COLOR_FAMILIES = [
  { id: 'red', label: 'Red', hex: '#dc2626' },
  { id: 'orange', label: 'Orange', hex: '#ea580c' },
  { id: 'yellow', label: 'Amber / Yellow', hex: '#ca8a04' },
  { id: 'green', label: 'Green', hex: '#16a34a' },
  { id: 'teal', label: 'Cyan / Teal', hex: '#0d9488' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'purple', label: 'Purple', hex: '#7c3aed' },
  { id: 'pink', label: 'Magenta / Pink', hex: '#db2777' },
  { id: 'neutral-light', label: 'Light Neutral', hex: '#e4e4e7' },
  { id: 'neutral-mid', label: 'Mid Gray', hex: '#71717a' },
  { id: 'neutral-dark', label: 'Dark Neutral', hex: '#27272a' }
];

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }

  return { h, s, l };
}

export function classifyColorFamily(h, s, l) {
  if (s < 0.12 || l < 0.09 || l > 0.93) {
    if (l < 0.28) return 'neutral-dark';
    if (l > 0.72) return 'neutral-light';
    return 'neutral-mid';
  }
  if (h < 16 || h >= 345) return 'red';
  if (h < 42) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 155) return 'green';
  if (h < 198) return 'teal';
  if (h < 255) return 'blue';
  if (h < 295) return 'purple';
  return 'pink';
}

function extractQuantizedPalette(rgba, totalPixels, maxSwatches = 5) {
  // Quantize RGB into 6x6x6 = 216 buckets for fast, deterministic palette extraction
  const counts = new Int32Array(216);
  const sumR = new Float64Array(216);
  const sumG = new Float64Array(216);
  const sumB = new Float64Array(216);

  for (let i = 0; i < totalPixels; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const qr = Math.min(5, Math.floor((r / 256) * 6));
    const qg = Math.min(5, Math.floor((g / 256) * 6));
    const qb = Math.min(5, Math.floor((b / 256) * 6));
    const bucket = qr * 36 + qg * 6 + qb;
    counts[bucket]++;
    sumR[bucket] += r;
    sumG[bucket] += g;
    sumB[bucket] += b;
  }

  const buckets = [];
  for (let b = 0; b < 216; b++) {
    if (counts[b] > 0) {
      const c = counts[b];
      const r = sumR[b] / c;
      const g = sumG[b] / c;
      const bl = sumB[b] / c;
      buckets.push({ count: c, r, g, b: bl });
    }
  }

  buckets.sort((a, b) => b.count - a.count);

  // Merge overly close swatches so the 5-color palette has distinct colors
  const merged = [];
  for (const cand of buckets) {
    let absorbed = false;
    for (const m of merged) {
      const distSq = (cand.r - m.r) ** 2 + (cand.g - m.g) ** 2 + (cand.b - m.b) ** 2;
      if (distSq < 38 * 38) {
        const nextCount = m.count + cand.count;
        m.r = (m.r * m.count + cand.r * cand.count) / nextCount;
        m.g = (m.g * m.count + cand.g * cand.count) / nextCount;
        m.b = (m.b * m.count + cand.b * cand.count) / nextCount;
        m.count = nextCount;
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      merged.push({ ...cand });
    }
    if (merged.length >= maxSwatches * 2) break;
  }

  merged.sort((a, b) => b.count - a.count);
  const top = merged.slice(0, maxSwatches);
  const topSum = top.reduce((acc, s) => acc + s.count, 0) || 1;

  return top.map((s) => {
    const hsl = rgbToHsl(s.r, s.g, s.b);
    return {
      hex: rgbToHex(s.r, s.g, s.b),
      ratio: Number((s.count / topSum).toFixed(3)),
      h: Math.round(hsl.h),
      s: Number(hsl.s.toFixed(3)),
      l: Number(hsl.l.toFixed(3)),
      family: classifyColorFamily(hsl.h, hsl.s, hsl.l)
    };
  });
}

/**
 * Extracts a 64-dim visual feature vector, color palette, RGB/Luma histograms,
 * photography exposure/sharpness diagnostics, and heuristic themes from an RGBA buffer.
 */
export function analyzeRgbaBuffer(rgba, width, height, origWidth = width, origHeight = height) {
  const totalPixels = Math.max(1, width * height);
  const histR = new Array(32).fill(0);
  const histG = new Array(32).fill(0);
  const histB = new Array(32).fill(0);
  const histLuma = new Array(32).fill(0);

  const hslHist = new Float32Array(24); // 18 hue bins + 6 neutral lightness bins
  const gridSum = new Float32Array(27); // 3x3 spatial RGB sums
  const gridCount = new Int32Array(9);

  const lumaBuf = new Float32Array(totalPixels);

  let sumLuma = 0;
  let sumLumaSq = 0;
  let sumSat = 0;
  let sumRAll = 0;
  let sumBAll = 0;
  let shadowClipCount = 0;
  let highlightClipCount = 0;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(2, Math.floor((y / Math.max(1, height)) * 3));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(2, Math.floor((x / Math.max(1, width)) * 3));
      const pIdx = y * width + x;
      const r = rgba[pIdx * 4];
      const g = rgba[pIdx * 4 + 1];
      const b = rgba[pIdx * 4 + 2];

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaBuf[pIdx] = luma;

      histR[Math.min(31, r >> 3)]++;
      histG[Math.min(31, g >> 3)]++;
      histB[Math.min(31, b >> 3)]++;
      histLuma[Math.min(31, Math.floor((luma / 256) * 32))]++;

      sumLuma += luma;
      sumLumaSq += luma * luma;
      sumRAll += r;
      sumBAll += b;

      if (luma < 12) shadowClipCount++;
      if (luma > 243) highlightClipCount++;

      const { h, s, l } = rgbToHsl(r, g, b);
      sumSat += s;

      if (s < 0.12 || l < 0.08 || l > 0.94) {
        const lBin = 18 + Math.min(5, Math.floor(l * 6));
        hslHist[lBin] += 1;
      } else {
        const hBin = Math.min(17, Math.floor(h / 20));
        hslHist[hBin] += 1;
      }

      const cell = gy * 3 + gx;
      gridSum[cell * 3] += r / 255;
      gridSum[cell * 3 + 1] += g / 255;
      gridSum[cell * 3 + 2] += b / 255;
      gridCount[cell]++;
    }
  }

  // Sobel edge orientation histogram (8 bins) + 3x3 Laplacian variance for sharpness
  const edgeHist = new Float32Array(8);
  let sumLap = 0;
  let sumLapSq = 0;
  let interiorCount = 0;

  if (width >= 3 && height >= 3) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const tl = lumaBuf[idx - width - 1];
        const tc = lumaBuf[idx - width];
        const tr = lumaBuf[idx - width + 1];
        const ml = lumaBuf[idx - 1];
        const mc = lumaBuf[idx];
        const mr = lumaBuf[idx + 1];
        const bl = lumaBuf[idx + width - 1];
        const bc = lumaBuf[idx + width];
        const br = lumaBuf[idx + width + 1];

        const sx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const sy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const mag = Math.hypot(sx, sy);

        if (mag > 8) {
          let angle = Math.atan2(sy, sx);
          if (angle < 0) angle += Math.PI; // Unsigned orientation 0..PI
          const bin = Math.min(7, Math.floor((angle / Math.PI) * 8));
          edgeHist[bin] += mag;
        }

        const lap = 4 * mc - tc - bc - ml - mr;
        sumLap += lap;
        sumLapSq += lap * lap;
        interiorCount++;
      }
    }
  }

  const brightness = sumLuma / totalPixels;
  const varianceLuma = Math.max(0, sumLumaSq / totalPixels - brightness * brightness);
  const contrast = Math.sqrt(varianceLuma);
  const saturation = sumSat / totalPixels;
  const shadowClip = shadowClipCount / totalPixels;
  const highlightClip = highlightClipCount / totalPixels;

  // Warm (+) vs Cool (-) balance from Red-Blue differential
  const rawTemp = (sumRAll - sumBAll) / (totalPixels * 160);
  const temperature = Math.max(-1, Math.min(1, rawTemp));

  let sharpness = 0;
  if (interiorCount > 0) {
    const meanLap = sumLap / interiorCount;
    const lapVar = Math.max(0, sumLapSq / interiorCount - meanLap * meanLap);
    sharpness = Math.min(100, Math.round(Math.sqrt(lapVar) * 0.45));
  }

  // Assemble 64-dim vector: 24 HSL + 27 spatial RGB + 8 edge + 5 global stats = 64
  const vector = new Float32Array(64);
  for (let i = 0; i < 24; i++) {
    vector[i] = hslHist[i] / totalPixels;
  }
  for (let c = 0; c < 9; c++) {
    const cnt = Math.max(1, gridCount[c]);
    vector[24 + c * 3] = gridSum[c * 3] / cnt;
    vector[24 + c * 3 + 1] = gridSum[c * 3 + 1] / cnt;
    vector[24 + c * 3 + 2] = gridSum[c * 3 + 2] / cnt;
  }
  let edgeNorm = 0;
  for (let i = 0; i < 8; i++) edgeNorm += edgeHist[i];
  const edgeDenom = Math.max(1, interiorCount * 255);
  for (let i = 0; i < 8; i++) {
    vector[51 + i] = edgeNorm > 0 ? edgeHist[i] / edgeDenom : 0;
  }

  const safeW = Math.max(1, origWidth);
  const safeH = Math.max(1, origHeight);
  const aspect = safeW / safeH;

  vector[59] = brightness / 255;
  vector[60] = Math.min(1, contrast / 85);
  vector[61] = saturation;
  vector[62] = (temperature + 1) / 2;
  vector[63] = Math.max(0, Math.min(1, (Math.log2(aspect) + 2) / 4));

  // Palette & primary HSL
  const palette = extractQuantizedPalette(rgba, totalPixels, 5);
  const primary = palette[0] || { hex: '#808080', h: 0, s: 0, l: 0.5, family: 'neutral-mid' };

  // Resolution & Aspect buckets
  const megapixels = Number(((safeW * safeH) / 1_000_000).toFixed(2));
  let resolutionTier = 'FHD';
  if (megapixels < 0.5) resolutionTier = 'Tiny';
  else if (megapixels < 1.0) resolutionTier = 'SD';
  else if (megapixels < 2.0) resolutionTier = 'HD';
  else if (megapixels >= 8.0) resolutionTier = '4K+';

  let aspectBucket = 'Standard';
  if (aspect < 0.85) aspectBucket = 'Portrait';
  else if (aspect <= 1.15) aspectBucket = 'Square';
  else if (aspect <= 1.55) aspectBucket = 'Standard';
  else aspectBucket = 'Wide';

  // Exposure & Sharpness classifications
  let exposureStatus = 'Balanced';
  if (brightness < 55 || shadowClip > 0.45) {
    exposureStatus = 'Underexposed';
  } else if (brightness > 210 || highlightClip > 0.40) {
    exposureStatus = 'Overexposed';
  } else if (contrast < 22) {
    exposureStatus = 'Low Contrast';
  }

  let sharpnessLabel = 'Sharp';
  if (sharpness < 15) sharpnessLabel = 'Blurry';
  else if (sharpness < 35) sharpnessLabel = 'Soft';

  // Heuristic visual themes
  const themes = [];
  if (saturation < 0.1) themes.push('Monochrome');
  else if (saturation > 0.5) themes.push('Vibrant');
  else if (saturation < 0.25) themes.push('Muted');

  if (saturation >= 0.1 && temperature > 0.14) themes.push('Warm');
  if (saturation >= 0.1 && temperature < -0.14) themes.push('Cool');

  if (brightness > 185) themes.push('High-Key');
  else if (brightness < 70) themes.push('Low-Key');

  if (contrast > 62) themes.push('High-Contrast');
  if (sharpness >= 45) themes.push('Detailed');
  if (themes.length === 0) themes.push('Balanced');

  return {
    vector,
    dominantHex: primary.hex,
    colorFamily: primary.family,
    primaryHsl: { h: primary.h, s: primary.s, l: primary.l },
    palette,
    histograms: {
      r: histR.map((c) => Number((c / totalPixels).toFixed(4))),
      g: histG.map((c) => Number((c / totalPixels).toFixed(4))),
      b: histB.map((c) => Number((c / totalPixels).toFixed(4))),
      luma: histLuma.map((c) => Number((c / totalPixels).toFixed(4)))
    },
    photo: {
      megapixels,
      resolutionTier,
      aspectBucket,
      brightness: Math.round(brightness),
      contrast: Math.round(contrast),
      saturation: Number(saturation.toFixed(3)),
      temperature: Number(temperature.toFixed(3)),
      shadowClip: Number(shadowClip.toFixed(3)),
      highlightClip: Number(highlightClip.toFixed(3)),
      exposureStatus,
      sharpness,
      sharpnessLabel
    },
    themes
  };
}

/**
 * Aggregates image-level analytics into dataset-wide distributions for the sidebar charts.
 */
export function aggregateDatasetAnalytics(items) {
  const resolutionCounts = { Tiny: 0, SD: 0, HD: 0, FHD: 0, '4K+': 0 };
  const aspectCounts = { Portrait: 0, Square: 0, Standard: 0, Wide: 0 };
  const exposureCounts = { Underexposed: 0, Balanced: 0, Overexposed: 0, 'Low Contrast': 0 };
  const sharpnessCounts = { Blurry: 0, Soft: 0, Sharp: 0 };
  const themeCounts = {};
  const familyCounts = {};
  const sharpnessValues = [];
  const brightnessValues = [];

  let analyzedCount = 0;

  for (const item of items) {
    const a = item.analysis;
    if (!a) continue;
    analyzedCount++;

    if (resolutionCounts[a.photo.resolutionTier] !== undefined) {
      resolutionCounts[a.photo.resolutionTier]++;
    }
    if (aspectCounts[a.photo.aspectBucket] !== undefined) {
      aspectCounts[a.photo.aspectBucket]++;
    }
    if (exposureCounts[a.photo.exposureStatus] !== undefined) {
      exposureCounts[a.photo.exposureStatus]++;
    }
    if (sharpnessCounts[a.photo.sharpnessLabel] !== undefined) {
      sharpnessCounts[a.photo.sharpnessLabel]++;
    }

    sharpnessValues.push(a.photo.sharpness);
    brightnessValues.push(a.photo.brightness);

    const fam = a.colorFamily || 'neutral-mid';
    familyCounts[fam] = (familyCounts[fam] || 0) + 1;

    for (const t of a.themes) {
      themeCounts[t] = (themeCounts[t] || 0) + 1;
    }
  }

  const paletteSummary = COLOR_FAMILIES.map((cf) => ({
    ...cf,
    count: familyCounts[cf.id] || 0,
    ratio: analyzedCount > 0 ? (familyCounts[cf.id] || 0) / analyzedCount : 0
  })).filter((entry) => entry.count > 0);

  return {
    analyzedCount,
    resolutionCounts,
    aspectCounts,
    exposureCounts,
    sharpnessCounts,
    themeCounts,
    paletteSummary,
    sharpnessValues,
    brightnessValues
  };
}

