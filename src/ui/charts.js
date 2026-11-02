// HiDPI Canvas Histograms, RGB/Luminance Curves, and Distribution Renderers

/**
 * Draws a clean 1D distribution histogram (Confidence, Sharpness, or Brightness)
 * with active range highlighting.
 */
export function drawRangeHistogram(canvasEl, values, minDomain, maxDomain, selMin, selMax, theme = 'light') {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  const rect = canvasEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const drawW = Math.max(120, rect.width || 240);
  const drawH = Math.max(54, rect.height || 72);

  canvasEl.width = Math.floor(drawW * dpr);
  canvasEl.height = Math.floor(drawH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, drawW, drawH);

  const isDark = theme === 'dark';
  const activeColor = isDark ? '#3b82f6' : '#2563eb';
  const mutedColor = isDark ? '#272b36' : '#e4e4e0';
  const labelColor = isDark ? '#a1a1aa' : '#71717a';

  if (!values || values.length === 0) {
    ctx.fillStyle = labelColor;
    ctx.font = '500 11px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data yet', drawW / 2, drawH / 2);
    return;
  }

  const numBins = 24;
  const bins = new Array(numBins).fill(0);
  const span = Math.max(1e-6, maxDomain - minDomain);

  for (const v of values) {
    const norm = (v - minDomain) / span;
    const idx = Math.max(0, Math.min(numBins - 1, Math.floor(norm * numBins)));
    bins[idx]++;
  }

  const maxBin = Math.max(1, ...bins);
  const padBottom = 15;
  const availH = drawH - padBottom - 6;
  const binW = drawW / numBins;

  for (let i = 0; i < numBins; i++) {
    const bStart = minDomain + (i / numBins) * span;
    const bEnd = minDomain + ((i + 1) / numBins) * span;
    const inRange = bEnd > selMin && bStart < selMax;
    const barH = bins[i] > 0 ? Math.max(2, (bins[i] / maxBin) * availH) : 0;

    ctx.fillStyle = inRange ? activeColor : mutedColor;
    ctx.fillRect(i * binW + 1, drawH - padBottom - barH, Math.max(1, binW - 2), barH);
  }

  ctx.fillStyle = labelColor;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(formatAxisVal(minDomain), 2, drawH - 1);
  ctx.textAlign = 'center';
  ctx.fillText(formatAxisVal((minDomain + maxDomain) / 2), drawW / 2, drawH - 1);
  ctx.textAlign = 'right';
  ctx.fillText(formatAxisVal(maxDomain), drawW - 2, drawH - 1);
}

function formatAxisVal(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Draws a Lightroom-style smooth RGB + Luminance exposure curve inside the Inspector Modal.
 */
export function drawRgbCurve(canvasEl, histograms, theme = 'light') {
  if (!canvasEl || !histograms) return;
  const ctx = canvasEl.getContext('2d');
  const rect = canvasEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, rect.width || 280);
  const h = Math.max(80, rect.height || 96);

  canvasEl.width = Math.floor(w * dpr);
  canvasEl.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const bins = histograms.luma.length;
  const maxVal = Math.max(
    0.02,
    ...histograms.r.slice(1, -1),
    ...histograms.g.slice(1, -1),
    ...histograms.b.slice(1, -1),
    ...histograms.luma.slice(1, -1)
  );

  const channels = [
    { arr: histograms.r, stroke: 'rgba(220, 38, 38, 0.75)', fill: 'rgba(220, 38, 38, 0.14)' },
    { arr: histograms.g, stroke: 'rgba(22, 163, 74, 0.75)', fill: 'rgba(22, 163, 74, 0.14)' },
    { arr: histograms.b, stroke: 'rgba(37, 99, 235, 0.75)', fill: 'rgba(37, 99, 235, 0.14)' },
    {
      arr: histograms.luma,
      stroke: theme === 'dark' ? 'rgba(244, 244, 245, 0.9)' : 'rgba(24, 24, 27, 0.85)',
      fill: theme === 'dark' ? 'rgba(244, 244, 245, 0.08)' : 'rgba(24, 24, 27, 0.08)'
    }
  ];

  const padY = 6;
  const usableH = h - padY * 2;

  for (const ch of channels) {
    ctx.beginPath();
    ctx.moveTo(0, h - padY);
    for (let i = 0; i < bins; i++) {
      const x = (i / (bins - 1)) * w;
      const y = h - padY - Math.min(1, ch.arr[i] / maxVal) * usableH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h - padY);
    ctx.closePath();
    ctx.fillStyle = ch.fill;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const x = (i / (bins - 1)) * w;
      const y = h - padY - Math.min(1, ch.arr[i] / maxVal) * usableH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = ch.stroke;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  }
}
