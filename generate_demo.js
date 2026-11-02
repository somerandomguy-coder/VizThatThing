import fs from 'fs';
import JSZip from 'jszip';

function createPatternBMP(width, height, pixelFn) {
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  // BMP rows are padded to 4-byte multiples
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const imageSize = rowStride * height;
  const fileSize = fileHeaderSize + dibHeaderSize + imageSize;

  const buffer = Buffer.alloc(fileSize);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(0, 6);
  buffer.writeUInt32LE(fileHeaderSize + dibHeaderSize, 10);

  buffer.writeUInt32LE(dibHeaderSize, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(imageSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let y = 0; y < height; y++) {
    // BMP stores rows bottom-up
    const rowStart = 54 + (height - 1 - y) * rowStride;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      const off = rowStart + x * 3;
      buffer.writeUInt8(clamp(b), off);
      buffer.writeUInt8(clamp(g), off + 1);
      buffer.writeUInt8(clamp(r), off + 2);
    }
  }
  return buffer;
}

async function main() {
  const zip = new JSZip();
  const rows = ['filename,prediction,label,confidence,loss'];

  const archetypes = [
    { name: 'sunset', folder: 'images/train', w: 280, h: 180, base: [235, 95, 38], sharp: true },
    { name: 'ocean', folder: 'images/train', w: 240, h: 200, base: [28, 112, 225], sharp: false },
    { name: 'studio', folder: 'images/val', w: 220, h: 220, base: [232, 232, 228], sharp: false },
    { name: 'night', folder: 'images/val', w: 180, h: 260, base: [16, 20, 34], sharp: true }
  ];

  let idx = 0;
  for (let a = 0; a < archetypes.length; a++) {
    const arch = archetypes[a];
    for (let k = 0; k < 8; k++) {
      idx++;
      const filename = `${arch.name}_${String(k + 1).padStart(2, '0')}.bmp`;
      const fullPath = `${arch.folder}/${filename}`;
      const shift = (k - 3) * 10;

      const bmp = createPatternBMP(arch.w, arch.h, (x, y, w, h) => {
        const tx = x / w;
        const ty = y / h;
        let r = arch.base[0] + shift + tx * 35;
        let g = arch.base[1] + shift * 0.6 + ty * 35;
        let b = arch.base[2] - shift * 0.5 + (1 - tx) * 30;
        if (arch.sharp && ((x >> 3) + (y >> 3)) % 5 === 0) {
          r += 55;
          g += 55;
          b += 55;
        }
        return [r, g, b];
      });

      zip.file(fullPath, bmp);

      const isOk = idx % 5 !== 0;
      const pred = isOk ? arch.name : archetypes[(a + 1) % archetypes.length].name;
      const conf = (isOk ? 0.68 + (k % 5) * 0.07 : 0.31 + (k % 4) * 0.08).toFixed(4);
      const loss = (isOk ? 0.09 + (k % 3) * 0.06 : 1.18 + (k % 3) * 0.19).toFixed(4);
      rows.push(`${fullPath},${pred},${arch.name},${conf},${loss}`);
    }
  }

  zip.file('metadata.csv', rows.join('\n') + '\n');
  const content = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync('demo_dataset.zip', content);
  console.log('Generated rich 32-scene demo_dataset.zip');
}

main().catch(console.error);
