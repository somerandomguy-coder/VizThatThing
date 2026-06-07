import JSZip from 'jszip';

export class ZipHandler {
  constructor() {
    this.zip = null;
    this.images = []; // Flat list of images
    this.metadata = {}; // Basename/filename to metadata object map
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map(); // Flat folder path -> array of image items
    this.isLoaded = false;
  }

  /**
   * Loads and parses a ZIP file.
   * @param {File} file - ZIP File object from drag-and-drop or file input
   * @param {Function} onProgress - Callback for progress reporting
   */
  async loadZip(file, onProgress) {
    this.zip = new JSZip();
    this.images = [];
    this.metadata = {};
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map();
    this.isLoaded = false;

    onProgress({ status: 'reading', message: 'Reading ZIP file...' });

    // Load zip entries
    let zipData;
    try {
      zipData = await this.zip.loadAsync(file);
    } catch (e) {
      throw new Error('Failed to parse ZIP archive. Ensure it is a valid ZIP file.');
    }

    let entries = Object.values(zipData.files);
    let totalEntries = entries.length;
    let imageEntries = [];
    let metaEntries = [];

    // 1. Classify zip entries
    for (let i = 0; i < totalEntries; i++) {
      let entry = entries[i];
      if (entry.dir) continue;

      let name = entry.name.toLowerCase();
      if (name.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
        imageEntries.push(entry);
      } else if (name.match(/\.(csv|json|tsv|txt)$/)) {
        metaEntries.push(entry);
      }

      if (i % 200 === 0) {
        onProgress({
          status: 'classifying',
          message: `Classifying ZIP entries... (${i}/${totalEntries})`,
          percent: Math.round((i / totalEntries) * 30)
        });
      }
    }

    // 2. Parse metadata files
    onProgress({ status: 'metadata', message: 'Scanning for metadata...', percent: 35 });
    for (let metaEntry of metaEntries) {
      try {
        let content = await metaEntry.async('string');
        let parsed = this.parseMetaContent(metaEntry.name, content);
        if (parsed) {
          // Merge parsed metadata into main metadata map
          Object.assign(this.metadata, parsed);
        }
      } catch (e) {
        console.warn(`Failed to parse metadata file: ${metaEntry.name}`, e);
      }
    }

    // 3. Build image list and folder structure
    let totalImages = imageEntries.length;
    for (let i = 0; i < totalImages; i++) {
      let entry = imageEntries[i];
      let pathParts = entry.name.split('/');
      let filename = pathParts.pop();
      let parentPath = pathParts.join('/');

      // Setup image object
      let imageItem = {
        name: filename,
        fullPath: entry.name,
        parentPath: parentPath,
        zipEntry: entry,
        width: 0,
        height: 0,
        metadata: null,
        blobUrl: null,
        imageObj: null,
        dimensionsLoaded: false
      };

      // Match metadata
      imageItem.metadata = this.findMetadataForImage(entry.name, filename);

      this.images.push(imageItem);

      // Reconstruct folder tree structure
      this.addToDirectoryTree(pathParts, imageItem);

      if (i % 100 === 0) {
        onProgress({
          status: 'structuring',
          message: `Mapping directory tree... (${i}/${totalImages} images)`,
          percent: 35 + Math.round((i / totalImages) * 35)
        });
      }
    }

    // 4. Load dimensions of a small subset or on-demand
    // To position images we need their aspect ratios.
    // Instead of loading all images at once (which takes too long and uses too much memory),
    // we extract image sizes asynchronously as they are needed.
    // For now, let's load dimensions of the first 50 images in the active view, 
    // and for others, we will assume a square layout until loaded.
    
    this.isLoaded = true;
    onProgress({ status: 'done', message: 'ZIP loaded successfully!', percent: 100 });
    return this.directoryTree;
  }

  /**
   * Helper to add a file path to the directory tree
   */
  addToDirectoryTree(pathParts, imageItem) {
    let current = this.directoryTree;
    current.totalCount++;
    
    let pathAcc = '';
    for (let part of pathParts) {
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

    // Track flat map of folder paths -> list of image items
    let folderPath = imageItem.parentPath || 'root';
    if (!this.foldersMap.has(folderPath)) {
      this.foldersMap.set(folderPath, []);
    }
    this.foldersMap.get(folderPath).push(imageItem);
  }

  /**
   * Finds metadata associated with an image by matching filenames
   */
  findMetadataForImage(fullPath, filename) {
    let basename = filename.substring(0, filename.lastIndexOf('.')) || filename;
    
    // 1. Try exact full path
    if (this.metadata[fullPath]) return this.metadata[fullPath];
    // 2. Try filename
    if (this.metadata[filename]) return this.metadata[filename];
    // 3. Try basename (without extension)
    if (this.metadata[basename]) return this.metadata[basename];
    // 4. Try lowercase match
    if (this.metadata[filename.toLowerCase()]) return this.metadata[filename.toLowerCase()];
    if (this.metadata[basename.toLowerCase()]) return this.metadata[basename.toLowerCase()];

    // 5. Check if metadata map has keys containing our filename
    for (let key of Object.keys(this.metadata)) {
      let keyLower = key.toLowerCase();
      if (keyLower.endsWith(filename.toLowerCase()) || filename.toLowerCase().endsWith(keyLower)) {
        return this.metadata[key];
      }
      if (keyLower.endsWith(basename.toLowerCase()) || basename.toLowerCase().endsWith(keyLower)) {
        return this.metadata[key];
      }
    }

    return null;
  }

  /**
   * Parse metadata file contents (CSV/JSON/TSV/TXT)
   */
  parseMetaContent(filepath, text) {
    let name = filepath.toLowerCase();
    if (name.endsWith('.json')) {
      try {
        let parsed = JSON.parse(text);
        let result = {};
        
        if (Array.isArray(parsed)) {
          // If it's an array of objects, map each object by its file key
          for (let item of parsed) {
            let key = item.filename || item.image || item.id || item.image_id || item.file_name;
            if (key) {
              result[key] = item;
            }
          }
        } else if (typeof parsed === 'object') {
          // If it's a key-value object (filename -> metadata)
          for (let [key, val] of Object.entries(parsed)) {
            if (typeof val === 'object') {
              result[key] = val;
            } else {
              result[key] = { value: val };
            }
          }
        }
        return result;
      } catch (e) {
        console.error('JSON parse error', e);
        return null;
      }
    } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
      let separator = name.endsWith('.tsv') ? '\t' : ',';
      if (name.endsWith('.txt')) {
        // Auto-detect separator
        let firstLine = text.split('\n')[0];
        if (firstLine.includes('\t')) separator = '\t';
        else if (firstLine.includes(';')) separator = ';';
        else separator = ',';
      }

      let parsed = this.parseCSVText(text, separator);
      if (!parsed) return null;

      let { headers, data } = parsed;
      
      // Find filename column
      let fileCol = headers.find(h => h.match(/file|img|image|id|name/i));
      if (!fileCol && headers.length > 0) {
        fileCol = headers[0]; // Fallback to first column
      }

      if (!fileCol) return null;

      let result = {};
      for (let row of data) {
        let key = row[fileCol];
        if (key) {
          result[key] = row;
        }
      }
      return result;
    }
    return null;
  }

  /**
   * Helper to parse CSV formatted text
   */
  parseCSVText(text, sep) {
    let lines = text.split(/\r?\n/);
    lines = lines.filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;

    let headers = this.splitCSVLine(lines[0], sep);
    let data = [];

    for (let i = 1; i < lines.length; i++) {
      let values = this.splitCSVLine(lines[i], sep);
      if (values.length === 0) continue;

      let obj = {};
      for (let j = 0; j < headers.length; j++) {
        let val = values[j] !== undefined ? values[j] : '';
        // Clean outer quotes
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        
        // Convert numbers if applicable
        if (val && !isNaN(val)) {
          val = Number(val);
        }

        obj[headers[j]] = val;
      }
      data.push(obj);
    }

    return { headers, data };
  }

  splitCSVLine(line, sep) {
    let result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      let char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
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

  /**
   * Retrieves the images in a specific directory path.
   * @param {string} folderPath - Path (empty string for root)
   * @returns {Array} List of image structures
   */
  getImagesInFolder(folderPath) {
    if (folderPath === 'root' || folderPath === '') {
      // Find all files in the directoryTree root files, 
      // or return all images in the entire zip.
      // Let's make 'root' mean all images in the zip if flat, 
      // or just files in the root folder.
      // Usually, if a dataset is flat, all images are in the root directory.
      let list = this.foldersMap.get('') || [];
      if (list.length === 0 && folderPath === 'root') {
        return this.images; // Return all images as a fallback
      }
      return list;
    }
    return this.foldersMap.get(folderPath) || [];
  }

  /**
   * Asynchronously loads dimensions for a specific image item.
   * Creates a temporary blob url to fetch dimensions.
   */
  loadImageDimensions(imageItem) {
    if (imageItem.dimensionsLoaded) return Promise.resolve(imageItem);

    return new Promise(async (resolve, reject) => {
      try {
        let blob = await imageItem.zipEntry.async('blob');
        let url = URL.createObjectURL(blob);
        let img = new Image();
        img.onload = () => {
          imageItem.width = img.naturalWidth || 200;
          imageItem.height = img.naturalHeight || 200;
          imageItem.dimensionsLoaded = true;
          URL.revokeObjectURL(url); // Clean up temp URL
          resolve(imageItem);
        };
        img.onerror = () => {
          imageItem.width = 200;
          imageItem.height = 200;
          imageItem.dimensionsLoaded = true;
          URL.revokeObjectURL(url);
          resolve(imageItem); // Resolve with defaults
        };
        img.src = url;
      } catch (e) {
        imageItem.width = 200;
        imageItem.height = 200;
        imageItem.dimensionsLoaded = true;
        resolve(imageItem);
      }
    });
  }

  /**
   * Pre-extracts dimensions for a list of images (chunked/concurrent)
   */
  async loadBatchDimensions(imageItems, onBatchProgress) {
    let promises = [];
    let count = 0;
    let total = imageItems.length;

    for (let item of imageItems) {
      if (item.dimensionsLoaded) {
        count++;
        continue;
      }
      
      let p = this.loadImageDimensions(item).then(() => {
        count++;
        if (onBatchProgress) {
          onBatchProgress(count, total);
        }
      });
      promises.push(p);

      // Throttle concurrency to prevent thread congestion (max 10 parallel file reads)
      if (promises.length >= 10) {
        await Promise.all(promises);
        promises = [];
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * Extracts and creates a URL for an image item if it doesn't have one
   */
  async getBlobUrl(imageItem) {
    if (imageItem.blobUrl) return imageItem.blobUrl;
    
    let blob = await imageItem.zipEntry.async('blob');
    imageItem.blobUrl = URL.createObjectURL(blob);
    return imageItem.blobUrl;
  }

  /**
   * Revokes the blob URL of an image item to free memory
   */
  revokeBlobUrl(imageItem) {
    if (imageItem.blobUrl) {
      URL.revokeObjectURL(imageItem.blobUrl);
      imageItem.blobUrl = null;
      imageItem.imageObj = null;
    }
  }
}
