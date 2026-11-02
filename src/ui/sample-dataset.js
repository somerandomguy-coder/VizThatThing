import JSZip from 'jszip';

/**
 * Generates an in-memory 36-image synthetic dataset ZIP showcasing warm/cool palettes,
 * sharp vs soft focus, high-key/low-key exposures, varied aspect ratios, and predictions.
 */
export async function buildSampleDatasetZip() {
  const zip = new JSZip();
  const archetypes = [
    {
      folder: 'train/sunset_warm',
      label: 'sunset',
      w: 280,
      h: 180,
      bg1: [244, 114, 43],
      bg2: [180, 42, 62],
      accent: [253, 224, 71],
      sharp: true
    },
    {
      folder: 'train/alpine_cool',
      label: 'alpine',
      w: 260,
      h: 200,
      bg1: [28, 100, 212],
      bg2: [14, 165, 233],
      accent: [226, 232, 240],
      sharp: true
    },
    {
      folder: 'val/studio_minimal',
      label: 'studio',
      w: 220,
      h: 220,
      bg1: [238, 238, 235],
      bg2: [212, 212, 208],
      accent: [82, 82, 91],
      sharp: false
    },
    {
      folder: 'val/night_contrast',
      label: 'night',
      w: 180,
      h: 260,
      bg1: [12, 15, 24],
      bg2: [30, 27, 58],
      accent: [56, 189, 248],
      sharp: true
    }
  ];

  const rows = ['filename,label,prediction,confidence,loss'];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let idx = 0;
  for (let aIdx = 0; aIdx < archetypes.length; aIdx++) {
    const arch = archetypes[aIdx];
    for (let k = 0; k < 9; k++) {
      idx++;
      const w = arch.w + ((k % 3) - 1) * 20;
      const h = arch.h + (((k + 1) % 3) - 1) * 16;
      canvas.width = w;
      canvas.height = h;

      // Slight per-sample variation
      const jitter = (k - 4) * 9;
      const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

      const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
      g.addColorStop(
        0,
        `rgb(${clamp(arch.bg1[0] + jitter)}, ${clamp(arch.bg1[1] + jitter)}, ${clamp(arch.bg1[2] + jitter)})`
      );
      g.addColorStop(
        1,
        `rgb(${clamp(arch.bg2[0] - jitter)}, ${clamp(arch.bg2[1] + jitter * 0.5)}, ${clamp(arch.bg2[2] - jitter)})`
      );
      ctx.filter = arch.sharp && k % 4 !== 0 ? 'none' : 'blur(4px)';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Draw crisp geometric horizon / architectural features on sharp items
      ctx.fillStyle = `rgb(${arch.accent[0]}, ${arch.accent[1]}, ${arch.accent[2]})`;
      ctx.beginPath();
      ctx.arc(w * (0.3 + (k % 4) * 0.14), h * 0.38, Math.min(w, h) * 0.16, 0, Math.PI * 2);
      ctx.fill();

      if (arch.sharp && k % 4 !== 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 2;
        for (let s = 0; s < 5; s++) {
          const bx = 18 + s * (w / 5.5);
          const bh = 24 + ((s * 17 + k * 11) % 55);
          ctx.strokeRect(bx, h - bh - 12, w / 9, bh);
        }
      }
      ctx.filter = 'none';

      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const fname = `${arch.label}_${String(k + 1).padStart(2, '0')}.png`;
      const fullPath = `${arch.folder}/${fname}`;
      zip.file(fullPath, blob);

      const isCorrect = idx % 6 !== 0;
      const otherLabel = archetypes[(aIdx + 1) % archetypes.length].label;
      const pred = isCorrect ? arch.label : otherLabel;
      const conf = (isCorrect ? 0.72 + (k % 5) * 0.06 : 0.34 + (k % 4) * 0.08).toFixed(4);
      const loss = (isCorrect ? 0.08 + (k % 3) * 0.06 : 1.12 + (k % 3) * 0.21).toFixed(4);
      rows.push(`${fullPath},${arch.label},${pred},${conf},${loss}`);
    }
  }

  zip.file('metadata.csv', rows.join('\n') + '\n');
  const outBlob = await zip.generateAsync({ type: 'blob' });
  outBlob.name = 'sample_scenes.zip';
  return outBlob;
}

