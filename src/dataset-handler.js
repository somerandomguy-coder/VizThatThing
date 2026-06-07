import JSZip from 'jszip';

export class DatasetHandler {
  constructor() {
    this.zip = null;
    this.dirHandle = null;
    this.mode = null; // 'zip' | 'directory' | 'fileslist'
    this.images = []; // Flat list of images
    this.metadata = {}; // Basename/filename to metadata object map
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map(); // Flat folder path -> array of image items
    this.isLoaded = false;
  }

  /**
   * Loads from a ZIP file archive.
   */
  async loadZip(file, onProgress) {
    this.zip = new JSZip();
    this.dirHandle = null;
    this.mode = 'zip';
    return this.parseZip(file, onProgress);
  }

  /**
   * Mounts a local folder using Directory Picker handle.
   */
  async loadDirectory(dirHandle, onProgress) {
    this.zip = null;
    this.dirHandle = dirHandle;
    this.mode = 'directory';
    return this.parseDirectory(dirHandle, onProgress);
  }

  /**
   * Loads from a standard HTML5 FileList (Folder Upload).
   */
  async loadFilesList(files, onProgress) {
    this.zip = null;
    this.dirHandle = null;
    this.mode = 'fileslist';
    return this.parseFilesList(files, onProgress);
  }

  /**
   * ZIP parsing engine.
   */
  async parseZip(file, onProgress) {
    this.images = [];
    this.metadata = {};
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map();
    this.isLoaded = false;

    onProgress({ status: 'reading', message: 'Reading ZIP file...' });

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
          Object.assign(this.metadata, parsed);
        }
      } catch (e) {
        console.warn(`Failed to parse metadata file: ${metaEntry.name}`, e);
      }
    }

    // 3. Reconstruct directory tree
    let totalImages = imageEntries.length;
    for (let i = 0; i < totalImages; i++) {
      let entry = imageEntries[i];
      let pathParts = entry.name.split('/');
      let filename = pathParts.pop();
      let parentPath = pathParts.join('/');

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

      imageItem.metadata = this.findMetadataForImage(entry.name, filename);
      this.images.push(imageItem);
      this.addToDirectoryTree(pathParts, imageItem);

      if (i % 100 === 0) {
        onProgress({
          status: 'structuring',
          message: `Mapping directory tree... (${i}/${totalImages} images)`,
          percent: 35 + Math.round((i / totalImages) * 35)
        });
      }
    }

    this.isLoaded = true;
    onProgress({ status: 'done', message: 'ZIP loaded successfully!', percent: 100 });
    return this.directoryTree;
  }

  /**
   * Directory Handle parsing engine.
   */
  async parseDirectory(dirHandle, onProgress) {
    this.images = [];
    this.metadata = {};
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map();
    this.isLoaded = false;

    onProgress({ status: 'scanning', message: 'Scanning local directory...' });

    let filesList = [];
    
    // Recursive scanner for Directory Handles
    async function scan(handle, relativePath = '') {
      for await (const entry of handle.values()) {
        const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          filesList.push({ entry, path });
        } else if (entry.kind === 'directory') {
          await scan(entry, path);
        }
      }
    }

    try {
      await scan(dirHandle);
    } catch (e) {
      throw new Error('Failed to read directory. Please check permissions.');
    }

    let totalFiles = filesList.length;
    let imageFiles = [];
    let metaFiles = [];

    // Classify
    for (let i = 0; i < totalFiles; i++) {
      let f = filesList[i];
      let nameLower = f.entry.name.toLowerCase();
      if (nameLower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
        imageFiles.push(f);
      } else if (nameLower.match(/\.(csv|json|tsv|txt)$/)) {
        metaFiles.push(f);
      }
    }

    // Parse metadata
    onProgress({ status: 'metadata', message: 'Parsing metadata files...', percent: 30 });
    for (let mf of metaFiles) {
      try {
        let file = await mf.entry.getFile();
        let content = await file.text();
        let parsed = this.parseMetaContent(mf.path, content);
        if (parsed) {
          Object.assign(this.metadata, parsed);
        }
      } catch (e) {
        console.warn(`Failed to parse metadata file: ${mf.path}`, e);
      }
    }

    // Map images and structure directory tree
    let totalImages = imageFiles.length;
    for (let i = 0; i < totalImages; i++) {
      let im = imageFiles[i];
      let pathParts = im.path.split('/');
      let filename = pathParts.pop();
      let parentPath = pathParts.join('/');

      let imageItem = {
        name: filename,
        fullPath: im.path,
        parentPath: parentPath,
        fileHandle: im.entry, // Local FileSystemHandle
        width: 0,
        height: 0,
        metadata: null,
        blobUrl: null,
        imageObj: null,
        dimensionsLoaded: false
      };

      imageItem.metadata = this.findMetadataForImage(im.path, filename);
      this.images.push(imageItem);
      this.addToDirectoryTree(pathParts, imageItem);

      if (i % 200 === 0) {
        onProgress({
          status: 'structuring',
          message: `Mapping directory tree... (${i}/${totalImages} images)`,
          percent: 40 + Math.round((i / totalImages) * 50)
        });
      }
    }

    this.isLoaded = true;
    onProgress({ status: 'done', message: 'Directory mounted successfully!', percent: 100 });
    return this.directoryTree;
  }

  /**
   * Standard Folder Upload parsing engine.
   */
  async parseFilesList(files, onProgress) {
    this.images = [];
    this.metadata = {};
    this.directoryTree = { name: 'root', path: '', children: {}, files: [], totalCount: 0 };
    this.foldersMap = new Map();
    this.isLoaded = false;

    onProgress({ status: 'scanning', message: 'Scanning uploaded folder files...' });

    let filesArray = Array.from(files);
    let totalFiles = filesArray.length;
    let imageFiles = [];
    let metaFiles = [];

    // Classify
    for (let i = 0; i < totalFiles; i++) {
      let file = filesArray[i];
      let relativePath = file.webkitRelativePath || file.name;
      // Strip top level folder name wrapper to keep paths clean
      let firstSlashIdx = relativePath.indexOf('/');
      if (firstSlashIdx !== -1) {
        relativePath = relativePath.substring(firstSlashIdx + 1);
      }
      
      let nameLower = file.name.toLowerCase();
      if (nameLower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/)) {
        imageFiles.push({ file, path: relativePath });
      } else if (nameLower.match(/\.(csv|json|tsv|txt)$/)) {
        metaFiles.push({ file, path: relativePath });
      }
    }

    // Parse metadata
    onProgress({ status: 'metadata', message: 'Parsing metadata files...', percent: 30 });
    for (let mf of metaFiles) {
      try {
        let content = await mf.file.text();
        let parsed = this.parseMetaContent(mf.path, content);
        if (parsed) {
          Object.assign(this.metadata, parsed);
        }
      } catch (e) {
        console.warn(`Failed to parse metadata file: ${mf.path}`, e);
      }
    }

    // Map images and structure directory tree
    let totalImages = imageFiles.length;
    for (let i = 0; i < totalImages; i++) {
      let im = imageFiles[i];
      let pathParts = im.path.split('/');
      let filename = pathParts.pop();
      let parentPath = pathParts.join('/');

      let imageItem = {
        name: filename,
        fullPath: im.path,
        parentPath: parentPath,
        nativeFile: im.file, // Native browser File object
        width: 0,
        height: 0,
        metadata: null,
        blobUrl: null,
        imageObj: null,
        dimensionsLoaded: false
      };

      imageItem.metadata = this.findMetadataForImage(im.path, filename);
      this.images.push(imageItem);
      this.addToDirectoryTree(pathParts, imageItem);

      if (i % 200 === 0) {
        onProgress({
          status: 'structuring',
          message: `Mapping directory tree... (${i}/${totalImages} images)`,
          percent: 40 + Math.round((i / totalImages) * 50)
        });
      }
    }

    this.isLoaded = true;
    onProgress({ status: 'done', message: 'Folder uploaded successfully!', percent: 100 });
    return this.directoryTree;
  }

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

    let folderPath = imageItem.parentPath || 'root';
    if (!this.foldersMap.has(folderPath)) {
      this.foldersMap.set(folderPath, []);
    }
    this.foldersMap.get(folderPath).push(imageItem);
  }

  findMetadataForImage(fullPath, filename) {
    let basename = filename.substring(0, filename.lastIndexOf('.')) || filename;
    
    if (this.metadata[fullPath]) return this.metadata[fullPath];
    if (this.metadata[filename]) return this.metadata[filename];
    if (this.metadata[basename]) return this.metadata[basename];
    if (this.metadata[filename.toLowerCase()]) return this.metadata[filename.toLowerCase()];
    if (this.metadata[basename.toLowerCase()]) return this.metadata[basename.toLowerCase()];

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

  parseMetaContent(filepath, text) {
    let name = filepath.toLowerCase();
    if (name.endsWith('.json')) {
      try {
        let parsed = JSON.parse(text);
        let result = {};
        
        if (Array.isArray(parsed)) {
          for (let item of parsed) {
            let key = item.filename || item.image || item.id || item.image_id || item.file_name;
            if (key) {
              result[key] = item;
            }
          }
        } else if (typeof parsed === 'object') {
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
        let firstLine = text.split('\n')[0];
        if (firstLine.includes('\t')) separator = '\t';
        else if (firstLine.includes(';')) separator = ';';
        else separator = ',';
      }

      let parsed = this.parseCSVText(text, separator);
      if (!parsed) return null;

      let { headers, data } = parsed;
      
      let fileCol = headers.find(h => h.match(/file|img|image|id|name/i));
      if (!fileCol && headers.length > 0) {
        fileCol = headers[0];
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
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
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

  getImagesInFolder(folderPath) {
    if (folderPath === 'root' || folderPath === '') {
      let list = this.foldersMap.get('') || [];
      if (list.length === 0 && folderPath === 'root') {
        return this.images;
      }
      return list;
    }
    return this.foldersMap.get(folderPath) || [];
  }

  /**
   * Unified image dimension retriever (BMP/PNG/JPG/etc)
   */
  loadImageDimensions(imageItem) {
    if (imageItem.dimensionsLoaded) return Promise.resolve(imageItem);

    return new Promise(async (resolve, reject) => {
      try {
        let url;
        if (this.mode === 'zip') {
          let blob = await imageItem.zipEntry.async('blob');
          url = URL.createObjectURL(blob);
        } else if (this.mode === 'directory') {
          let file = await imageItem.fileHandle.getFile();
          url = URL.createObjectURL(file);
        } else if (this.mode === 'fileslist') {
          url = URL.createObjectURL(imageItem.nativeFile);
        }
        
        let img = new Image();
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
      } catch (e) {
        imageItem.width = 200;
        imageItem.height = 200;
        imageItem.dimensionsLoaded = true;
        resolve(imageItem);
      }
    });
  }

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

      if (promises.length >= 12) {
        await Promise.all(promises);
        promises = [];
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * Retrieves blob URL based on current mode
   */
  async getBlobUrl(imageItem) {
    if (imageItem.blobUrl) return imageItem.blobUrl;
    
    if (this.mode === 'zip') {
      let blob = await imageItem.zipEntry.async('blob');
      imageItem.blobUrl = URL.createObjectURL(blob);
    } else if (this.mode === 'directory') {
      let file = await imageItem.fileHandle.getFile();
      imageItem.blobUrl = URL.createObjectURL(file);
    } else if (this.mode === 'fileslist') {
      imageItem.blobUrl = URL.createObjectURL(imageItem.nativeFile);
    }
    return imageItem.blobUrl;
  }

  revokeBlobUrl(imageItem) {
    if (imageItem.blobUrl) {
      URL.revokeObjectURL(imageItem.blobUrl);
      imageItem.blobUrl = null;
      imageItem.imageObj = null;
    }
  }
}
