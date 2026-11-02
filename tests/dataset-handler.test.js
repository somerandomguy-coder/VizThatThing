import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DatasetHandler } from '../src/dataset-handler.js';

test('DatasetHandler parses CSV metadata and associates labels/predictions with images', async () => {
  const zip = new JSZip();
  zip.file('images/cat_01.png', new Uint8Array([137, 80, 78, 71]));
  zip.file('metadata.csv', 'filename,label,prediction,confidence\nimages/cat_01.png,cat,dog,0.82\n');
  const buf = await zip.generateAsync({ type: 'uint8array' });

  const handler = new DatasetHandler();
  await handler.loadZip(buf, () => { });

  assert.equal(handler.images.length, 1);
  assert.equal(handler.images[0].metadata.label, 'cat');
  assert.equal(handler.images[0].metadata.prediction, 'dog');
  assert.equal(handler.images[0].metadata.confidence, 0.82);
});

test('DatasetHandler parses YOLOv8 data.yaml and labels/*.txt into normalized ground-truth boxes', async () => {
  const zip = new JSZip();
  zip.file('data.yaml', "train: ../train/images\nnc: 2\nnames: ['manhole', 'damaged_cover']\n");
  zip.file('train/images/frame_001.jpg', new Uint8Array([255, 216, 255]));
  zip.file('train/labels/frame_001.txt', '1 0.5 0.5 0.4 0.3\n0 0.2 0.2 0.1 0.1\n');
  const buf = await zip.generateAsync({ type: 'uint8array' });

  const handler = new DatasetHandler();
  await handler.loadZip(buf, () => { });

  assert.equal(handler.images.length, 1);
  const img = handler.images[0];
  assert.ok(Array.isArray(img.annotations), 'Expected YOLO annotations array on image item');
  assert.equal(img.annotations.length, 2);
  assert.equal(img.annotations[0].label, 'damaged_cover');
  assert.ok(Math.abs(img.annotations[0].bbox[0] - 0.3) < 1e-6); // cx - w/2 = 0.5 - 0.2 = 0.3
  assert.ok(Math.abs(img.annotations[0].bbox[1] - 0.35) < 1e-6); // cy - h/2 = 0.5 - 0.15 = 0.35
  assert.equal(img.metadata.label, 'damaged_cover');
});

