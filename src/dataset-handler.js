import JSZip from 'jszip';
import { applyCurationRecord } from './curation/project-csv.js';

export class DatasetHandler {
  constructor() {
    this.zip = null;
    this.mode = null; // 'zip' | 'fileslist'
    this.images = [];
    this.metadata = {};
    this.yoloAnnotations = new Map(); // stem or normalized path -> boxes[]
    this.classNames = []; // Optional class names from data.yaml / classes.txt
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map();
    this.isLoaded = false;
    this.datasetName = '';
  }

  resetState() {
    this.images = [];
    this.metadata = {};
    this.yoloAnnotations = new Map();
    this.classNames = [];
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map();
    this.isLoaded = false;
  }

  async loadZip(file, onProgress = () => {}) {
    this.zip = new JSZip();
    this.mode = 'zip';
    this.datasetName = file?.name ? file.name.replace(/\.zip$/i, '') : 'Archive Dataset';
    return this.parseZip(file, onProgress);
  }

  async loadFilesList(files, onProgress = () => {}) {
    this.zip = null;
    this.mode = 'fileslist';
    const firstRel = files?.[0]?.webkitRelativePath || '';
    this.datasetName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Uploaded Folder';
    return this.parseFilesList(files, onProgress);
  }

  async parseZip(file, onProgress) {
    this.resetState();
    onProgress({ status: 'reading', message: 'Reading ZIP archive...', percent: 5 });

    let zipData;
    try {
      zipData = await this.zip.loadAsync(file);
    } catch {
      throw new Error('Failed to parse ZIP archive. Ensure it is a valid .zip file.');
    }

    const entries = Object.values(zipData.files);
    const totalEntries = entries.length;
    const imageEntries = [];
    const metaEntries = [];
    const yamlEntries = [];

    for (let i = 0; i < totalEntries; i++) {
      const entry = entries[i];
      if (entry.dir) continue;
      if (entry.name.includes('__MACOSX/') || entry.name.split('/').pop().startsWith('._')) continue;

      const lower = entry.name.toLowerCase();
      if (lower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
        imageEntries.push(entry);
      } else if (lower.match(/\.(yaml|yml)$/) || lower.endsWith('classes.txt')) {
        yamlEntries.push(entry);
      } else if (lower.match(/\.(csv|json|tsv|txt)$/)) {
        metaEntries.push(entry);
      }

      if (i % 250 === 0) {
        onProgress({
          status: 'classifying',
          message: `Scanning archive entries (${i}/${totalEntries})`,
          percent: Math.round((i / Math.max(1, totalEntries)) * 25)
        });
      }
    }

    for (const yEntry of yamlEntries) {
      try {
        const text = await yEntry.async('string');
        this.parseClassConfig(yEntry.name, text);
      } catch (e) {
        console.warn(`Failed to parse config ${yEntry.name}`, e);
      }
    }

    onProgress({ status: 'metadata', message: 'Parsing annotations & project CSVs...', percent: 30 });
    for (const metaEntry of metaEntries) {
      try {
        const content = await metaEntry.async('string');
        this.ingestMetaOrYolo(metaEntry.name, content);
      } catch (e) {
        console.warn(`Failed to parse metadata file: ${metaEntry.name}`, e);
      }
    }

    const totalImages = imageEntries.length;
    for (let i = 0; i < totalImages; i++) {
      const entry = imageEntries[i];
      const pathParts = entry.name.split('/');
      const filename = pathParts.pop();
      const parentPath = pathParts.join('/');

      const imageItem = this.createImageItem({
        filename,
        fullPath: entry.name,
        parentPath,
        zipEntry: entry
      });

      this.images.push(imageItem);
      this.addToDirectoryTree(pathParts, imageItem);

      if (i % 150 === 0) {
        onProgress({
          status: 'structuring',
          message: `Indexing images (${i}/${totalImages})`,
          percent: 35 + Math.round((i / Math.max(1, totalImages)) * 60)
        });
      }
    }

    this.isLoaded = true;
    onProgress({ status: 'done', message: 'Dataset ready', percent: 100 });
    return this.directoryTree;
  }

  async parseFilesList(files, onProgress) {
    this.resetState();
    onProgress({ status: 'scanning', message: 'Scanning uploaded files...', percent: 5 });

    const filesArray = Array.from(files);
    const imageFiles = [];
    const metaFiles = [];
    const yamlFiles = [];

    for (const file of filesArray) {
      if (file.name.startsWith('.')) continue;
      let relativePath = file.webkitRelativePath || file.name;
      const firstSlashIdx = relativePath.indexOf('/');
      if (firstSlashIdx !== -1) {
        relativePath = relativePath.substring(firstSlashIdx + 1);
      }

      const lower = file.name.toLowerCase();
      if (lower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
        imageFiles.push({ file, path: relativePath });
      } else if (lower.match(/\.(yaml|yml)$/) || lower === 'classes.txt') {
        yamlFiles.push({ file, path: relativePath });
      } else if (lower.match(/\.(csv|json|tsv|txt)$/)) {
        metaFiles.push({ file, path: relativePath });
      }
    }

    for (const yf of yamlFiles) {
      try {
        this.parseClassConfig(yf.path, await yf.file.text());
      } catch (e) {
        console.warn(`Failed to parse config: ${yf.path}`, e);
      }
    }

    onProgress({ status: 'metadata', message: 'Parsing annotations & project CSVs...', percent: 30 });
    for (const mf of metaFiles) {
      try {
        this.ingestMetaOrYolo(mf.path, await mf.file.text());
      } catch (e) {
        console.warn(`Failed to parse metadata: ${mf.path}`, e);
      }
    }

    const totalImages = imageFiles.length;
    for (let i = 0; i < totalImages; i++) {
      const im = imageFiles[i];
      const pathParts = im.path.split('/');
      const filename = pathParts.pop();
      const parentPath = pathParts.join('/');

      const imageItem = this.createImageItem({
        filename,
        fullPath: im.path,
        parentPath,
        nativeFile: im.file
      });

      this.images.push(imageItem);
      this.addToDirectoryTree(pathParts, imageItem);

      if (i % 200 === 0) {
        onProgress({
          status: 'structuring',
          message: `Indexing images (${i}/${totalImages})`,
          percent: 40 + Math.round((i / Math.max(1, totalImages)) * 55)
        });
      }
    }

    this.isLoaded = true;
    onProgress({ status: 'done', message: 'Folder loaded', percent: 100 });
    return this.directoryTree;
  }

  createImageItem({ filename, fullPath, parentPath, zipEntry = null, nativeFile = null }) {
    const metadata = this.findMetadataForImage(fullPath, filename);
    const annotations = this.findYoloForImage(fullPath, filename);

    let finalMeta = metadata ? { ...metadata } : null;
    if (annotations && annotations.length > 0) {
      if (!finalMeta) finalMeta = {};
      if (finalMeta.label === undefined && finalMeta.ground_truth === undefined && finalMeta.gt === undefined) {
        finalMeta.label = annotations[0].label;
      }
      finalMeta.box_count = annotations.length;
    }

    const item = {
      name: filename,
      fullPath,
      parentPath,
      zipEntry,
      nativeFile,
      width: 0,
      height: 0,
      metadata: finalMeta,
      annotations: annotations || [],
      curation: {
        tags: [],
        group: '',
        manualCluster: ''
      },
      customPos: null,
      analysis: null, // Populated by AnalysisController
      pca: null,
      umap: null,
      clusterId: null,
      isMedoid: false,
      ai: {
        faces: null,
        humans: null,
        embedding: null,
        clipThemes: null
      },
      blobUrl: null,
      imageObj: null,
      thumbDrawable: null,
      dimensionsLoaded: false
    };

    if (finalMeta) {
      applyCurationRecord(item, finalMeta);
    }

    return item;
  }

  /**
   * Imports a standalone CSV string onto an already-loaded dataset, matching by full_path first, then filename.
   */
  importExternalCSV(csvText) {
    const parsed = this.parseCSVText(csvText, ',');
    if (!parsed || !parsed.data || parsed.data.length === 0) {
      return { matchedCount: 0 };
    }

    const { headers, data } = parsed;
    const pathCol = headers.find((h) => /^full_path$|^path$/i.test(h));
    const fileCol = headers.find((h) => /file|img|image|id|name/i.test(h)) || headers[0];

    const byFullPath = new Map();
    const byFilename = new Map();

    for (const row of data) {
      const fp = pathCol && row[pathCol] ? String(row[pathCol]).trim() : '';
      const fn = fileCol && row[fileCol] ? String(row[fileCol]).trim() : '';
      if (fp) byFullPath.set(fp.toLowerCase(), row);
      if (fn && !fp) byFilename.set(fn.toLowerCase(), row);
    }

    let matchedCount = 0;
    for (const img of this.images) {
      const row =
        byFullPath.get(img.fullPath.toLowerCase()) ||
        byFilename.get(img.fullPath.toLowerCase()) ||
        byFilename.get(img.name.toLowerCase());

      if (row) {
        img.metadata = { ...(img.metadata || {}), ...row };
        applyCurationRecord(img, row);
        this.metadata[img.fullPath] = img.metadata;
        matchedCount++;
      }
    }

    return { matchedCount };
  }

  parseClassConfig(filepath, text) {
    const lower = filepath.toLowerCase();
    if (lower.endsWith('classes.txt')) {
      const names = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (names.length > 0) this.classNames = names;
      return;
    }

    const inlineMatch = text.match(/names\s*:\s*\[([^\]]+)\]/);
    if (inlineMatch) {
      this.classNames = inlineMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      return;
    }

    const lines = text.split(/\r?\n/);
    let inNames = false;
    const extracted = [];
    for (const raw of lines) {
      if (/^names\s*:/.test(raw.trim())) {
        inNames = true;
        continue;
      }
      if (inNames) {
        if (/^[a-zA-Z0-9_]+\s*:/.test(raw) && !/^\s+\d+\s*:/.test(raw)) {
          break;
        }
        const dictMatch = raw.match(/^\s*(\d+)\s*:\s*(.+)$/);
        const listMatch = raw.match(/^\s*-\s*(.+)$/);
        if (dictMatch) {
          extracted[Number(dictMatch[1])] = dictMatch[2].trim().replace(/^['"]|['"]$/g, '');
        } else if (listMatch) {
          extracted.push(listMatch[1].trim().replace(/^['"]|['"]$/g, ''));
        }
      }
    }
    if (extracted.length > 0) {
      this.classNames = extracted.map((v, i) => v || `class_${i}`);
    }
  }

  ingestMetaOrYolo(filepath, content) {
    const lower = filepath.toLowerCase();
    if (lower.endsWith('.txt')) {
      const yoloBoxes = this.tryParseYoloBoxes(content);
      if (yoloBoxes !== null) {
        const filename = filepath.split('/').pop();
        const stem = filename.substring(0, filename.lastIndexOf('.')) || filename;
        const imgPathGuess = filepath.replace(/\/labels\//i, '/images/').replace(/\.txt$/i, '');
        this.yoloAnnotations.set(stem.toLowerCase(), yoloBoxes);
        this.yoloAnnotations.set(imgPathGuess.toLowerCase(), yoloBoxes);
        return;
      }
    }

    const parsed = this.parseMetaContent(filepath, content);
    if (parsed) {
      Object.assign(this.metadata, parsed);
    }
  }

  tryParseYoloBoxes(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const boxes = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 5) return null;
      const clsId = Number(parts[0]);
      if (!Number.isInteger(clsId) || clsId < 0) return null;
      const nums = parts.slice(1).map(Number);
      if (nums.some((n) => !Number.isFinite(n) || n < -0.05 || n > 1.05)) return null;

      let x;
      let y;
      let w;
      let h;
      if (nums.length === 4) {
        const [cx, cy, bw, bh] = nums;
        w = bw;
        h = bh;
        x = cx - bw / 2;
        y = cy - bh / 2;
      } else if (nums.length >= 6 && nums.length % 2 === 0) {
        let minX = 1;
        let maxX = 0;
        let minY = 1;
        let maxY = 0;
        for (let i = 0; i < nums.length; i += 2) {
          minX = Math.min(minX, nums[i]);
          maxX = Math.max(maxX, nums[i]);
          minY = Math.min(minY, nums[i + 1]);
          maxY = Math.max(maxY, nums[i + 1]);
        }
        x = minX;
        y = minY;
        w = maxX - minX;
        h = maxY - minY;
      } else {
        return null;
      }

      const label = this.classNames[clsId] || `class_${clsId}`;
      boxes.push({
        type: 'gt',
        classId: clsId,
        label,
        bbox: [Math.max(0, x), Math.max(0, y), Math.min(1, w), Math.min(1, h)]
      });
    }
    return boxes;
  }

  findYoloForImage(fullPath, filename) {
    if (this.yoloAnnotations.size === 0) return null;
    const noExtPath = (fullPath.substring(0, fullPath.lastIndexOf('.')) || fullPath).toLowerCase();
    const stem = (filename.substring(0, filename.lastIndexOf('.')) || filename).toLowerCase();
    return this.yoloAnnotations.get(noExtPath) || this.yoloAnnotations.get(stem) || null;
  }

  addToDirectoryTree(pathParts, imageItem) {
    let current = this.directoryTree;
    current.totalCount++;

    let pathAcc = '';
    for (const part of pathParts) {
      if (!part) continue;
      pathAcc = pathAcc ? `${pathAcc}/${part}` : part;

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: pathAcc,
          children: {},
          files: [],
          totalCount: 0
        };
      }
      current = current.children[part];
      current.totalCount++;
    }

    current.files.push(imageItem);

    const folderPath = imageItem.parentPath || 'root';
    if (!this.foldersMap.has(folderPath)) {
      this.foldersMap.set(folderPath, []);
    }
    this.foldersMap.get(folderPath).push(imageItem);
  }

  findMetadataForImage(fullPath, filename) {
    if (!this.metadata || Object.keys(this.metadata).length === 0) return null;
    const basename = filename.substring(0, filename.lastIndexOf('.')) || filename;

    if (this.metadata[fullPath]) return this.metadata[fullPath];
    if (this.metadata[fullPath.toLowerCase()]) return this.metadata[fullPath.toLowerCase()];
    if (this.metadata[filename]) return this.metadata[filename];
    if (this.metadata[basename]) return this.metadata[basename];
    if (this.metadata[filename.toLowerCase()]) return this.metadata[filename.toLowerCase()];
    if (this.metadata[basename.toLowerCase()]) return this.metadata[basename.toLowerCase()];

    const fpLower = fullPath.toLowerCase();
    const fLower = filename.toLowerCase();
    for (const key of Object.keys(this.metadata)) {
      const keyLower = key.toLowerCase();
      if (keyLower === fpLower || keyLower.endsWith(`/${fpLower}`) || fpLower.endsWith(`/${keyLower}`)) {
        return this.metadata[key];
      }
    }
    for (const key of Object.keys(this.metadata)) {
      const keyLower = key.toLowerCase();
      if (!keyLower.includes('/') && (keyLower === fLower || fLower.endsWith(keyLower))) {
        return this.metadata[key];
      }
    }
    return null;
  }

  parseMetaContent(filepath, text) {
    const name = filepath.toLowerCase();
    if (name.endsWith('.json')) {
      try {
        const parsed = JSON.parse(text);
        const result = {};
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const key =
              item.full_path || item.path || item.filename || item.image || item.id || item.image_id || item.file_name;
            if (key) result[key] = item;
          }
        } else if (parsed && typeof parsed === 'object') {
          for (const [key, val] of Object.entries(parsed)) {
            result[key] = typeof val === 'object' ? val : { value: val };
          }
        }
        return result;
      } catch {
        return null;
      }
    } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
      let separator = name.endsWith('.tsv') ? '\t' : ',';
      if (name.endsWith('.txt')) {
        const firstLine = text.split('\n')[0] || '';
        if (firstLine.includes('\t')) separator = '\t';
        else if (firstLine.includes(';')) separator = ';';
        else if (firstLine.includes(',')) separator = ',';
        else return null;
      }

      const parsed = this.parseCSVText(text, separator);
      if (!parsed) return null;

      const { headers, data } = parsed;
      // Prefer full_path / path when present so identical filenames in train/ vs valid/ never collide
      const pathCol = headers.find((h) => /^full_path$|^path$/i.test(h));
      let fileCol = pathCol || headers.find((h) => h.match(/file|img|image|id|name|path/i));
      if (!fileCol && headers.length > 0) fileCol = headers[0];
      if (!fileCol) return null;

      const fallbackNameCol = pathCol ? headers.find((h) => /^filename$|^file$|^name$/i.test(h)) : null;

      const result = {};
      const seenFallback = new Set();
      for (const row of data) {
        const key = row[fileCol];
        if (key) {
          result[String(key)] = row;
        }
        if (fallbackNameCol && row[fallbackNameCol]) {
          const fbKey = String(row[fallbackNameCol]);
          if (!seenFallback.has(fbKey) && !result[fbKey]) {
            result[fbKey] = row;
            seenFallback.add(fbKey);
          } else if (seenFallback.has(fbKey) && result[fbKey] && fbKey !== String(key)) {
            // Ambiguous duplicate bare filename across subfolders; rely on full_path key
            delete result[fbKey];
          }
        }
      }
      return result;
    }
    return null;
  }

  parseCSVText(text, sep) {
    const cleanText = String(text || '').replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return null;

    const headers = this.splitCSVLine(lines[0], sep);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.splitCSVLine(lines[i], sep);
      if (values.length === 0) continue;

      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        let val = values[j] !== undefined ? values[j] : '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (val !== '' && !isNaN(val)) {
          val = Number(val);
        }
        obj[headers[j]] = val;
      }
      data.push(obj);
    }

    return { headers, data };
  }

  splitCSVLine(line, sep) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === sep && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  }

  getImagesInFolder(folderPath) {
    if (!folderPath || folderPath === 'root') {
      return this.images;
    }
    const direct = this.foldersMap.get(folderPath);
    const prefix = `${folderPath}/`;
    const matches = this.images.filter(
      (img) => img.parentPath === folderPath || img.parentPath.startsWith(prefix)
    );
    return matches.length > 0 ? matches : direct || [];
  }

  async getBlob(imageItem) {
    if (this.mode === 'zip') {
      return imageItem.zipEntry.async('blob');
    } else if (this.mode === 'fileslist') {
      return imageItem.nativeFile;
    }
    throw new Error('Unknown dataset source mode');
  }

  /**
   * Generates and caches a lightweight downscaled canvas/bitmap sprite (max 256px longest edge)
   * so high-resolution 4K/24MP photos never bloat GPU/RAM during spatial canvas rendering.
   * Immediately releases the temporary full-resolution source image/URL after downscaling.
   */
  async getThumbnailDrawable(imageItem, maxEdge = 256) {
    if (imageItem.thumbDrawable) return imageItem.thumbDrawable;

    const blob = await this.getBlob(imageItem);

    if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
      const bmp = await createImageBitmap(blob);
      const origW = bmp.width || 200;
      const origH = bmp.height || 200;
      imageItem.width = origW;
      imageItem.height = origH;
      imageItem.dimensionsLoaded = true;

      const scale = Math.min(1, maxEdge / Math.max(origW, origH));
      const tw = Math.max(1, Math.round(origW * scale));
      const th = Math.max(1, Math.round(origH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, tw, th);
      bmp.close();

      imageItem.thumbDrawable = canvas;
      return canvas;
    }

    // Fallback using HTMLImageElement + immediate URL revocation
    const tempUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const origW = img.naturalWidth || 200;
        const origH = img.naturalHeight || 200;
        imageItem.width = origW;
        imageItem.height = origH;
        imageItem.dimensionsLoaded = true;
        URL.revokeObjectURL(tempUrl);

        if (typeof document !== 'undefined') {
          const scale = Math.min(1, maxEdge / Math.max(origW, origH));
          const tw = Math.max(1, Math.round(origW * scale));
          const th = Math.max(1, Math.round(origH * scale));
          const canvas = document.createElement('canvas');
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, tw, th);
          imageItem.thumbDrawable = canvas;
          resolve(canvas);
        } else {
          imageItem.thumbDrawable = img;
          resolve(img);
        }
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(tempUrl);
        reject(err);
      };
      img.src = tempUrl;
    });
  }

  /**
   * Creates an on-demand temporary full-resolution Blob URL for the Double-Click Lightbox.
   * Caller MUST revoke this URL via `URL.revokeObjectURL(url)` when closing or stepping away.
   */
  async getFullResObjectUrl(imageItem) {
    const blob = await this.getBlob(imageItem);
    return URL.createObjectURL(blob);
  }

  loadImageDimensions(imageItem) {
    if (imageItem.dimensionsLoaded) return Promise.resolve(imageItem);

    return new Promise(async (resolve) => {
      try {
        const blob = await this.getBlob(imageItem);
        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(blob);
          imageItem.width = bmp.width || 200;
          imageItem.height = bmp.height || 200;
          imageItem.dimensionsLoaded = true;
          bmp.close();
          resolve(imageItem);
          return;
        }

        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          imageItem.width = img.naturalWidth || 200;
          imageItem.height = img.naturalHeight || 200;
          imageItem.dimensionsLoaded = true;
          URL.revokeObjectURL(url);
          resolve(imageItem);
        };
        img.onerror = () => {
          imageItem.width = 200;
          imageItem.height = 200;
          imageItem.dimensionsLoaded = true;
          URL.revokeObjectURL(url);
          resolve(imageItem);
        };
        img.src = url;
      } catch {
        imageItem.width = 200;
        imageItem.height = 200;
        imageItem.dimensionsLoaded = true;
        resolve(imageItem);
      }
    });
  }

  async loadBatchDimensions(items, concurrency = 24) {
    if (!Array.isArray(items) || items.length === 0) return;
    const pending = items.filter((it) => it && !it.dimensionsLoaded);
    if (pending.length === 0) return;

    let idx = 0;
    const workerCount = Math.min(concurrency, pending.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (idx < pending.length) {
        const current = pending[idx++];
        await this.loadImageDimensions(current);
      }
    });
    await Promise.all(workers);
  }

  async getBlobUrl(imageItem) {
    if (imageItem.blobUrl) return imageItem.blobUrl;
    const blob = await this.getBlob(imageItem);
    imageItem.blobUrl = URL.createObjectURL(blob);
    return imageItem.blobUrl;
  }

  generateMockPredictions() {
    for (const img of this.images) {
      const parts = img.parentPath.split('/');
      let folderLabel = parts[parts.length - 1] || 'root';
      if (folderLabel === 'images' || folderLabel === 'labels') {
        folderLabel = parts[parts.length - 2] || 'root';
      }

      let gt = img.metadata?.label || folderLabel;
      const generic = ['root', 'train', 'val', 'test', 'valid'];
      if (generic.includes(String(gt).toLowerCase())) {
        gt =
          this.classNames.length >= 2
            ? this.classNames[img.name.charCodeAt(0) % this.classNames.length]
            : img.name.charCodeAt(0) % 2 === 0
              ? 'class_a'
              : 'class_b';
      }

      const isCorrect = Math.random() > 0.2;
      let pred = gt;
      if (!isCorrect) {
        pred = gt === 'class_a' ? 'class_b' : `alt_${gt}`;
      }

      const confidence = isCorrect ? 0.62 + Math.random() * 0.37 : 0.22 + Math.random() * 0.36;
      const loss = isCorrect ? Math.random() * 0.35 : 0.72 + Math.random() * 0.85;

      const mockMeta = {
        ...(img.metadata || {}),
        prediction: pred,
        label: gt,
        confidence: Number(confidence.toFixed(4)),
        loss: Number(loss.toFixed(4))
      };

      img.metadata = mockMeta;
      this.metadata[img.fullPath] = mockMeta;
    }
  }

  revokeBlobUrl(imageItem) {
    if (imageItem.blobUrl) {
      URL.revokeObjectURL(imageItem.blobUrl);
      imageItem.blobUrl = null;
      imageItem.imageObj = null;
    }
  }

  releaseThumbnail(imageItem) {
    if (imageItem.thumbDrawable) {
      imageItem.thumbDrawable = null;
    }
    this.revokeBlobUrl(imageItem);
  }
}
