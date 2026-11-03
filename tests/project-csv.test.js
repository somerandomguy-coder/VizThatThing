import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeProjectCSV,
  applyCurationRecord,
  summarizeCuration
} from '../src/curation/project-csv.js';

test('serializeProjectCSV exports tags, group, cluster_override, and custom_x/custom_y with proper escaping', () => {
  const images = [
    {
      name: 'street,01.jpg',
      fullPath: 'train/street,01.jpg',
      metadata: { label: 'manhole', prediction: 'manhole', confidence: 0.95 },
      curation: { tags: ['night', 'wet-asphalt'], group: 'hero-shots', manualCluster: 'Cluster A' },
      customPos: { x: 412.6, y: -88.2 }
    },
    {
      name: 'plain.jpg',
      fullPath: 'valid/plain.jpg',
      metadata: null,
      curation: { tags: [], group: '', manualCluster: '' },
      customPos: null
    }
  ];

  const csv = serializeProjectCSV(images);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(
    lines[0],
    'filename,full_path,label,prediction,confidence,tags,group,cluster_override,custom_x,custom_y'
  );
  assert.ok(lines[1].includes('"street,01.jpg"'));
  assert.ok(lines[1].includes('night;wet-asphalt'));
  assert.ok(lines[1].includes('hero-shots'));
  assert.ok(lines[1].includes('Cluster A'));
  assert.ok(lines[1].includes('413,-88'));
});

test('applyCurationRecord hydrates tags, group, manualCluster, and customPos cleanly', () => {
  const item = {
    name: 'img.png',
    fullPath: 'train/img.png',
    curation: { tags: [], group: '', manualCluster: '' },
    customPos: null
  };

  applyCurationRecord(item, {
    tags: 'blurry; low-light ; blurry',
    group: 'review-pile',
    cluster_override: '2',
    custom_x: 320,
    custom_y: 640
  });

  assert.deepEqual(item.curation.tags, ['blurry', 'low-light']);
  assert.equal(item.curation.group, 'review-pile');
  assert.equal(item.curation.manualCluster, '2');
  assert.deepEqual(item.customPos, { x: 320, y: 640 });
});

test('summarizeCuration counts tags, groups, manual clusters, and custom positions', () => {
  const items = [
    {
      curation: { tags: ['warm', 'keep'], group: 'favorites', manualCluster: 'C1' },
      customPos: { x: 10, y: 20 }
    },
    {
      curation: { tags: ['keep'], group: 'favorites', manualCluster: '' },
      customPos: null
    }
  ];

  const summary = summarizeCuration(items);
  assert.equal(summary.tagCounts.keep, 2);
  assert.equal(summary.tagCounts.warm, 1);
  assert.equal(summary.groupCounts.favorites, 2);
  assert.equal(summary.manualClusterCounts.C1, 1);
  assert.equal(summary.customPosCount, 1);
});

