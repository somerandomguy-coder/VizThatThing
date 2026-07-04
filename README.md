# VizThatThing

> **High-Density, Client-Side Visual Diagnostics for Machine Learning & Computer Vision Datasets.**

**VizThatThing** is a high-performance developer tool built for data scientists, ML engineers, and computer vision researchers to inspect, analyze, and diagnose image datasets completely client-side in the browser. 

Unlike traditional dataset viewers that require remote cloud uploads or complex python GUI setups, VizThatThing operates entirely in your browser. It uses modern Web APIs for folder mounting, `JSZip` for in-memory decompression, and a high-density HTML5 Canvas engine for smooth navigation.

---

## Key Features

- **🔒 Zero-Upload, Complete Privacy**: All dataset files, zip archives, and metadata are processed entirely in the browser. Your dataset never leaves your local machine.
- **⚡ Local Folder Mounting**: Mount directories directly from your local filesystem using the modern browser **File System Access API** for instant access without waiting for uploads.
- **📦 ZIP Archive Parsing**: Drag-and-drop or select any dataset `.zip` archive. VizThatThing extracts it in-memory on the fly.
- **🎨 Interactive Performance Canvas**:
  - **Dynamic Zoom & Pan**: Fluid canvas navigation allowing you to fly through thousands of images.
  - **Frustum Culling & Memory Management**: Renders only what is visible on the screen and actively releases object URLs to prevent browser crashes on large datasets.
- **🌓 Linked Dual Viewports (Split-Screen)**: Compare two folders side-by-side (e.g., comparing `train` vs `val`, or checking classification differences between distinct category folders) with synchronized zooming and panning.
- **📈 Embedded Visual Metrics**:
  - Automatically parses annotation/metadata files (`.csv`, `.json`, `.tsv`, `.txt`).
  - Displays classification accuracy metrics (Accuracy, Correct vs. Incorrect counts).
  - Highlights prediction errors in the grid (green border for correct, red border for incorrect classification).
  - **Interactive Confidence Range Slider**: Filter dataset items using an interactive confidence distribution histogram.
- **📐 Advanced Packing Layouts**:
  - **2D Bin Packing Layout**: Uses a custom growing bin packer to pack images of varying aspect ratios tightly, maximizing screen utilization.
  - **Justified Grid Layout**: Neatly aligns rows to keep aspect ratios intact for comfortable scanning.
- **🔍 Glassmorphic Detailed Inspector**: Hover over any image to see a detailed meta-data HUD, or click to open a high-resolution preview modal with full metadata tables.

---

## Tech Stack

- **Core**: Vanilla HTML5, Javascript (ES6 Modules)
- **Styling**: Modern CSS3 (featuring HSL palettes, dark mode, and glassmorphism)
- **Layout Engines**: Custom Growing 2D Bin Packer, Justified Row Layout Solver
- **Bundler**: Vite
- **Dependencies**: `jszip` (for client-side zip decompression)

---

## Screenshots & Demo

*(Add your screenshots here after capturing them to make your repository stand out!)*

1. **Dashboard & Image Grid (Overview)**
   <!-- ![Dashboard Overview](public/screenshots/overview.png) -->
   *High-density image grid highlighting correct classification (green) and incorrect classifications (red) with real-time accuracy metrics.*

2. **Synchronized Split-Screen View**
   <!-- ![Synchronized Split View](public/screenshots/split_view.png) -->
   *Side-by-side dataset comparison comparing `train/` and `val/` directories with locked-viewport synchronized navigation.*

3. **Glassmorphic Hover Card & Detail Inspector**
   <!-- ![Detail Inspector](public/screenshots/inspector.png) -->
   *Hover-based tooltip showing real-time image properties, predictions, and confidence stats, alongside the detailed modal.*

4. **Empty State / Landing Page**
   <!-- ![Landing Screen](public/screenshots/landing.png) -->
   *Clean dark-mode landing interface with drag-and-drop zones and directory picker options.*

---

## Quick Start

### 1. Setup & Installation
Clone the repository, install dependencies, and start the development server:

```bash
# Clone the repository
git clone https://github.com/your-username/vizthatthing.git
cd vizthatthing

# Install dependencies
npm install

# Start local Vite development server
npm run dev
```

### 2. Try the Demo Dataset
We include a node script to generate a mock dataset with classification images, bounding metadata, and artificial model prediction errors for immediate testing:

```bash
# Generate the mock demo_dataset.zip
node generate_demo.js
```

1. Open `http://localhost:5173` in your browser.
2. Drag and drop the newly created `demo_dataset.zip` into the browser window.
3. Explore the metrics dashboard, folder tree, and visual diagnosis tools!

---

## Metadata Schema for Visual Diagnostics

To visualize accuracy metrics, correct/incorrect classification borders, and enable confidence range filters, VizThatThing looks for a metadata file (such as a `.csv`, `.tsv`, `.json`, or `.txt` file) inside the loaded folder or ZIP archive.

### 1. CSV / TSV / DSV / TXT Structure
The metadata file must include a header row mapping columns. The columns can be in any order, and the parser is case-insensitive.

Key column headers recognized by the engine:
- **Filename / ID**: `filename`, `full_path`, `img`, `image`, `id`, `name` (maps the metadata row to the image file)
- **Ground Truth**: `label`, `ground_truth`, `gt`
- **Prediction**: `prediction`, `pred`
- **Confidence**: `confidence`, `score` (numeric value between `0.0` and `1.0` used for histogram filtering)
- **Loss**: `loss` (optional metric)

**Example (`metadata.csv`):**
```csv
filename,label,prediction,confidence,loss
images/train/sample_001.png,cat,cat,0.9421,0.0410
images/train/sample_002.png,dog,cat,0.7251,1.4250
```

- **Correct Prediction (Green Outline)**: Triggered when `prediction` matches `label` (e.g., `cat` == `cat`).
- **Incorrect Prediction (Red Outline)**: Triggered when `prediction` differs from `label` (e.g., `cat` != `dog`).

### 2. JSON Structure
If you use a `.json` metadata file, it can be formatted in two ways:

#### A. Array of Objects
```json
[
  {
    "filename": "images/val/sample_001.png",
    "label": "cat",
    "prediction": "cat",
    "confidence": 0.9821
  },
  {
    "filename": "images/val/sample_002.png",
    "label": "dog",
    "prediction": "cat",
    "confidence": 0.8120
  }
]
```

#### B. Key-Value Map
```json
{
  "images/val/sample_001.png": {
    "label": "cat",
    "prediction": "cat",
    "confidence": 0.9821
  },
  "images/val/sample_002.png": {
    "label": "dog",
    "prediction": "cat",
    "confidence": 0.8120
  }
}
```

---

## ⚡ Generating Demo Predictions on Raw Datasets
If you upload or mount a dataset that doesn't have prediction metadata (for example, standard raw YOLO folder structures or plain image directories), VizThatThing will automatically display a **🎲 Generate Mock Predictions** button in the sidebar under **Metrics**.

Clicking this button will:
1. Automatically read your dataset folder names as mock class labels.
2. Dynamically assign mock ground-truth and prediction classifications (simulating an 80% accuracy score).
3. Compute randomized confidence levels and loss metrics for your images.

This allows you to preview the app's diagnostic view, filtering capabilities, and side-by-side correct/incorrect split view using **your own dataset** instantly!

---

## License

This project is open-source and available under the [MIT License](LICENSE).
