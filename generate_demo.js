import fs from 'fs';
import JSZip from 'jszip';

// Function to generate a simple solid color 200x200 BMP image buffer
function createSolidColorBMP(r, g, b, width = 200, height = 200) {
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const imageSize = width * height * 3; // 24-bit (3 bytes per pixel)
  const fileSize = fileHeaderSize + dibHeaderSize + imageSize;

  const buffer = Buffer.alloc(fileSize);

  // File Header
  buffer.write('BM', 0); // Signature
  buffer.writeUInt32LE(fileSize, 2); // File size
  buffer.writeUInt32LE(0, 6); // Reserved
  buffer.writeUInt32LE(fileHeaderSize + dibHeaderSize, 10); // Offset to pixel data

  // DIB Header
  buffer.writeUInt32LE(dibHeaderSize, 14); // Header size
  buffer.writeInt32LE(width, 18); // Width
  buffer.writeInt32LE(height, 22); // Height
  buffer.writeUInt16LE(1, 26); // Color planes
  buffer.writeUInt16LE(24, 28); // Bits per pixel
  buffer.writeUInt32LE(0, 30); // Compression (BI_RGB)
  buffer.writeUInt32LE(imageSize, 34); // Image size
  buffer.writeInt32LE(2835, 38); // H resolution (72 DPI)
  buffer.writeInt32LE(2835, 42); // V resolution (72 DPI)
  buffer.writeUInt32LE(0, 46); // Palette size
  buffer.writeUInt32LE(0, 50); // Important colors

  // Pixel Data (BGR order)
  let offset = 54;
  for (let i = 0; i < width * height; i++) {
    buffer.writeUInt8(b, offset);
    buffer.writeUInt8(g, offset + 1);
    buffer.writeUInt8(r, offset + 2);
    offset += 3;
  }

  return buffer;
}

async function main() {
  const zip = new JSZip();
  const dataset = [];

  // Generate 20 demo images
  for (let i = 1; i <= 20; i++) {
    const isVal = i > 10;
    const folder = isVal ? 'images/val' : 'images/train';
    const filename = `sample_${i.toString().padStart(3, '0')}.bmp`;
    const fullPath = `${folder}/${filename}`;

    // Create distinct colors
    const r = (i * 30) % 256;
    const g = (i * 60) % 256;
    const b = (i * 90) % 256;

    const imgBuffer = createSolidColorBMP(r, g, b, 200, 200);
    zip.file(fullPath, imgBuffer);

    // Make ground truth labels
    const actualLabel = i % 2 === 0 ? 'dog' : 'cat';
    // Make 20% of predictions incorrect (indices 5, 10, 15, 20)
    const predictedLabel = i % 5 === 0 ? (actualLabel === 'cat' ? 'dog' : 'cat') : actualLabel;
    const confidence = (0.4 + (i * 0.029)).toFixed(4);
    const loss = (i % 5 === 0 ? 1.5 - Math.random() * 0.5 : Math.random() * 0.4).toFixed(4);

    dataset.push({
      filename: filename,
      full_path: fullPath,
      label: actualLabel,
      prediction: predictedLabel,
      confidence: confidence,
      loss: loss
    });
  }

  // Create CSV metadata file
  let csvContent = 'filename,prediction,label,confidence,loss\n';
  for (const row of dataset) {
    csvContent += `${row.full_path},${row.prediction},${row.label},${row.confidence},${row.loss}\n`;
  }
  zip.file('metadata.csv', csvContent);

  // Generate ZIP file
  console.log('Generating demo_dataset.zip...');
  const content = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync('demo_dataset.zip', content);
  console.log('demo_dataset.zip generated successfully!');
}

main().catch(console.error);
