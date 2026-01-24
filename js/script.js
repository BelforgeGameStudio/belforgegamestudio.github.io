/**
 * Sprite Sheet Generator
 * Combine individual sprites into optimized sprite sheets
 */

// State
let sprites = [];
let tileSize = 32;
let maxCols = 8;
let padding = 0;
let autoFit = true;
let extrudeEdges = false;
let generatedCanvas = null;
let generatedMetadata = null;
let draggedIndex = null;

// Import modal state
let pendingImportImage = null;
let pendingImportName = '';
let importMode = 'slice';
let insertPosition = 'end';

// DOM helpers
const $ = id => document.getElementById(id);

// Element references
const dropZone = $('dropZone');
const fileInput = $('fileInput');
const spritesGrid = $('spritesGrid');
const previewCanvas = $('previewCanvas');
const previewEmpty = $('previewEmpty');
const dimensionDisplay = $('dimensionDisplay');
const generateBtn = $('generateBtn');
const downloadPngBtn = $('downloadPng');
const downloadJsonBtn = $('downloadJson');
const clearBtn = $('clearBtn');
const maxColsInput = $('maxCols');
const paddingInput = $('padding');
const autofitToggle = $('autofitToggle');
const extrudeToggle = $('extrudeToggle');
const snapPotBtn = $('snapPot');
const sheetNameInput = $('sheetName');
const sheetSizeSuffix = $('sheetSizeSuffix');
const spriteCountEl = $('spriteCount');
const rowCountEl = $('rowCount');
const sheetWidthEl = $('sheetWidth');
const sheetHeightEl = $('sheetHeight');
const toast = $('toast');
const sizeWarning = $('sizeWarning');
const mismatchCountEl = $('mismatchCount');
const expectedSizeEl = $('expectedSize');
const gpuWarning = $('gpuWarning');
const gpuLimitEl = $('gpuLimit');

// Import modal elements
const importModal = $('importModal');
const modalClose = $('modalClose');
const sheetPreviewCanvas = $('sheetPreviewCanvas');
const singlePreviewCanvas = $('singlePreviewCanvas');
const sliceWidthInput = $('sliceWidth');
const sliceHeightInput = $('sliceHeight');
const sliceSpacingXInput = $('sliceSpacingX');
const sliceSpacingYInput = $('sliceSpacingY');
const sliceOffsetXInput = $('sliceOffsetX');
const sliceOffsetYInput = $('sliceOffsetY');
const skipEmptyToggle = $('skipEmpty');
const cancelImportBtn = $('cancelImport');
const confirmImportBtn = $('confirmImport');
const insertIndexInput = $('insertIndex');
const insertIndexWrap = $('insertIndexWrap');

const autoDetectBtn = $('autoDetectBtn');
const detectResult = $('detectResult');
const detectResultText = $('detectResultText');
const detectConfidence = $('detectConfidence');
const skipEmptyHint = $('skipEmptyHint');

// ============================================================================
// Tile Size Controls
// ============================================================================

document.querySelectorAll('.tile-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tile-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tileSize = parseInt(btn.dataset.size);
        sheetSizeSuffix.textContent = `_${tileSize}x${tileSize}`;
        updateAll();
    });
});

// ============================================================================
// Input Controls
// ============================================================================

maxColsInput.addEventListener('change', () => {
    maxCols = Math.max(1, Math.min(128, parseInt(maxColsInput.value) || 8));
    maxColsInput.value = maxCols;
    updateAll();
});

paddingInput.addEventListener('change', () => {
    padding = Math.max(0, Math.min(16, parseInt(paddingInput.value) || 0));
    paddingInput.value = padding;
    updateAll();
});

autofitToggle.addEventListener('change', () => {
    autoFit = autofitToggle.checked;
    if (sprites.length > 0) generateSheet();
});

extrudeToggle.addEventListener('change', () => {
    extrudeEdges = extrudeToggle.checked;
    if (sprites.length > 0) generateSheet();
});

// ============================================================================
// Sorting
// ============================================================================

document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => sortSprites(btn.dataset.sort));
});

function sortSprites(type) {
    if (sprites.length < 2) return;
    switch (type) {
        case 'name-asc': sprites.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name-desc': sprites.sort((a, b) => b.name.localeCompare(a.name)); break;
        case 'natural': sprites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); break;
        case 'reverse': sprites.reverse(); break;
    }
    renderSpritesGrid();
    if (generatedCanvas) generateSheet();
    showToast('Sorted: ' + type);
}

// ============================================================================
// Power of Two Snap
// ============================================================================

snapPotBtn.addEventListener('click', () => {
    if (sprites.length === 0) { showToast('Add sprites first', true); return; }
    const cellSize = tileSize + padding * 2;
    const potWidths = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
    for (const potW of potWidths) {
        if (potW < cellSize) continue;
        const fitCols = Math.floor(potW / cellSize);
        if (fitCols >= 1) {
            maxCols = Math.min(fitCols, sprites.length);
            maxColsInput.value = maxCols;
            updateAll();
            showToast('Snapped to ' + calculateLayout().width + 'px');
            return;
        }
    }
});

// ============================================================================
// File Handling
// ============================================================================

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value = ''; });

async function handleFiles(files) {
    // Block if modal is already open
    if (importModal.classList.contains('show')) {
        showToast('Close import dialog first', true);
        return;
    }
    
    const pngFiles = Array.from(files).filter(f => f.type === 'image/png');
    if (pngFiles.length === 0) { showToast('PNG files only', true); return; }
    
    const regularSprites = [];
    const potentialSheets = [];
    
    for (const file of pngFiles) {
        try {
            const { img, objectURL } = await loadImage(file);
            const name = file.name.replace(/\.png$/i, '');
            
            // Smarter sheet detection:
            // - Must be at least 2x tile size in one dimension, OR
            // - Dimensions are exact multiples of tile size (likely a grid)
            const isLikelySheet = (img.width >= tileSize * 2 || img.height >= tileSize * 2) ||
                                  (img.width > tileSize && img.width % tileSize === 0 && img.height % tileSize === 0);
            
            if (isLikelySheet) {
                potentialSheets.push({ img, objectURL, name, width: img.width, height: img.height });
            } else {
                regularSprites.push({ name, image: img, objectURL, width: img.width, height: img.height });
            }
        } catch (err) { console.error('Failed:', file.name, err); }
    }
    
    // Add regular sprites immediately
    if (regularSprites.length > 0) {
        sprites.push(...regularSprites);
        
        // Auto-populate sheet name from first file (only if still default)
        if (sheetNameInput.value === 'spritesheet' || sheetNameInput.value === '') {
            const firstName = regularSprites[0].name;
            // Try to extract a base name (remove trailing numbers/suffixes)
            const cleanName = firstName
                .replace(/_\d+$/, '')           // Remove trailing _000 style suffixes
                .replace(/[-_]?\d+$/, '')        // Remove trailing numbers
                .replace(/[-_]?sheet$/i, '')    // Remove 'sheet' suffix
                .replace(/[-_]?sprites?$/i, '') // Remove 'sprite(s)' suffix
                .trim();
            if (cleanName) {
                sheetNameInput.value = cleanName;
            }
        }
        
        renderSpritesGrid();
        updateAll();
        showToast('Added ' + regularSprites.length + ' sprite(s)');
    }
    
    // Handle potential sheets one at a time
    if (potentialSheets.length > 0) {
        processPendingSheets(potentialSheets);
    }
}

async function processPendingSheets(sheets) {
    for (const sheet of sheets) {
        await showImportModal(sheet);
    }
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectURL = URL.createObjectURL(file);
        img.onload = () => resolve({ img, objectURL });
        img.onerror = () => { URL.revokeObjectURL(objectURL); reject(new Error('Load failed')); };
        img.src = objectURL;
    });
}

function revokeSprite(sprite) { 
    if (sprite.objectURL) URL.revokeObjectURL(sprite.objectURL); 
}

// ============================================================================
// Import Modal
// ============================================================================

function showImportModal(imageData) {
    return new Promise((resolve) => {
        pendingImportImage = imageData;
        pendingImportName = imageData.name;
        
        // Set slice dimensions to current tile size
        sliceWidthInput.value = tileSize;
        sliceHeightInput.value = tileSize;
        sliceSpacingXInput.value = 0;
        sliceSpacingYInput.value = 0;
        sliceOffsetXInput.value = 0;
        sliceOffsetYInput.value = 0;
        
        // Update insert index max
        insertIndexInput.max = sprites.length;
        insertIndexInput.value = Math.min(insertIndexInput.value, sprites.length);
        
        // Reset to slice mode
        importMode = 'slice';
        document.querySelectorAll('.import-mode-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.import-mode-tab[data-mode="slice"]').classList.add('active');
        $('sliceMode').style.display = 'block';
        $('singleMode').style.display = 'none';
        detectResult.style.display = 'none';
        
        updateImportPreview();
        importModal.classList.add('show');
        
        // Store resolve for later
        importModal._resolve = resolve;
    });
}

function updateImportPreview() {
    if (!pendingImportImage) return;
    
    const img = pendingImportImage.img;
    const sliceW = Math.max(1, parseInt(sliceWidthInput.value) || tileSize);
    const sliceH = Math.max(1, parseInt(sliceHeightInput.value) || tileSize);
    const spacingX = Math.max(0, parseInt(sliceSpacingXInput.value) || 0);
    const spacingY = Math.max(0, parseInt(sliceSpacingYInput.value) || 0);
    const offsetX = Math.max(0, parseInt(sliceOffsetXInput.value) || 0);
    const offsetY = Math.max(0, parseInt(sliceOffsetYInput.value) || 0);
    
    // Update info displays
    $('importImgSize').textContent = `${img.width}×${img.height}`;
    $('singleImgSize').textContent = `${img.width}×${img.height}`;
    $('importSliceSize').textContent = `${sliceW}×${sliceH}`;
    
    const { cols, rows } = calculateSliceGrid(img.width, img.height, sliceW, sliceH, spacingX, spacingY, offsetX, offsetY);
    $('importGridSize').textContent = `${cols}×${rows}`;
    $('importSpriteCount').textContent = cols * rows;
    
    // Draw preview with grid overlay
    const canvas = sheetPreviewCanvas;
    const maxSize = 280;
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 2);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Draw grid overlay
    ctx.strokeStyle = 'rgba(232, 93, 4, 0.6)';
    ctx.lineWidth = 1;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = (offsetX + col * (sliceW + spacingX)) * scale;
            const y = (offsetY + row * (sliceH + spacingY)) * scale;
            ctx.strokeRect(x, y, sliceW * scale, sliceH * scale);
        }
    }
    
    // Single preview
    const singleCanvas = singlePreviewCanvas;
    const singleScale = Math.min(maxSize / img.width, maxSize / img.height, 2);
    singleCanvas.width = img.width * singleScale;
    singleCanvas.height = img.height * singleScale;
    const singleCtx = singleCanvas.getContext('2d');
    singleCtx.imageSmoothingEnabled = false;
    singleCtx.clearRect(0, 0, singleCanvas.width, singleCanvas.height);
    singleCtx.drawImage(img, 0, 0, singleCanvas.width, singleCanvas.height);
}

function closeImportModal(imported = false) {
    importModal.classList.remove('show');
    if (!imported && pendingImportImage) {
        URL.revokeObjectURL(pendingImportImage.objectURL);
    }
    if (importModal._resolve) {
        importModal._resolve();
        importModal._resolve = null;
    }
    pendingImportImage = null;
}

async function performImport() {
    if (!pendingImportImage) return;
    
    const img = pendingImportImage.img;
    const baseName = pendingImportName;
    
    let newSprites = [];
    
    if (importMode === 'slice') {
        const sliceW = parseInt(sliceWidthInput.value) || tileSize;
        const sliceH = parseInt(sliceHeightInput.value) || tileSize;
        const spacingX = parseInt(sliceSpacingXInput.value) || 0;
        const spacingY = parseInt(sliceSpacingYInput.value) || 0;
        const offsetX = parseInt(sliceOffsetXInput.value) || 0;
        const offsetY = parseInt(sliceOffsetYInput.value) || 0;
        const skipEmpty = skipEmptyToggle.checked;
        
        const { cols, rows } = calculateSliceGrid(img.width, img.height, sliceW, sliceH, spacingX, spacingY, offsetX, offsetY);
        
        if (cols <= 0 || rows <= 0) {
            showToast('Invalid slice settings', true);
            return;
        }
        
        // Disable button during processing
        confirmImportBtn.disabled = true;
        confirmImportBtn.textContent = 'Processing...';
        
        // ORDERING NOTE: spriteIndex uses loadPromises.length which works because:
        // 1. We push promises in strict row-major loop order
        // 2. We never mutate loadPromises array after pushing
        // 3. We sort by _sortIndex after Promise.all() resolves
        // If refactoring to parallel/chunked processing, preserve _sortIndex assignment order.
        const loadPromises = [];
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = offsetX + col * (sliceW + spacingX);
                const y = offsetY + row * (sliceH + spacingY);
                
                // Extract sprite to canvas
                const spriteCanvas = document.createElement('canvas');
                spriteCanvas.width = sliceW;
                spriteCanvas.height = sliceH;
                const ctx = spriteCanvas.getContext('2d');
                ctx.drawImage(img, x, y, sliceW, sliceH, 0, 0, sliceW, sliceH);
                
                // Check if empty (sample corners + center for speed, full scan only if needed)
                if (skipEmpty && isTileEmpty(ctx, sliceW, sliceH)) {
                    continue;
                }
                
                // Convert canvas to blob, then to image (more memory efficient than dataURL)
                // Use loadPromises.length for contiguous naming (not index, which includes skipped)
                const spriteIndex = loadPromises.length;
                const spriteName = `${baseName}_${String(spriteIndex).padStart(3, '0')}`;
                
                const loadPromise = new Promise((resolve) => {
                    spriteCanvas.toBlob((blob) => {
                        if (!blob) { resolve(null); return; }
                        const objectURL = URL.createObjectURL(blob);
                        const spriteImg = new Image();
                        spriteImg.onload = () => {
                            resolve({
                                name: spriteName,
                                image: spriteImg,
                                objectURL,
                                width: sliceW,
                                height: sliceH,
                                _sortIndex: spriteIndex
                            });
                        };
                        spriteImg.onerror = () => {
                            URL.revokeObjectURL(objectURL);
                            resolve(null);
                        };
                        spriteImg.src = objectURL;
                    }, 'image/png');
                });
                
                loadPromises.push(loadPromise);
            }
        }
        
        // Wait for all images to load
        const results = await Promise.all(loadPromises);
        newSprites = results.filter(s => s !== null).sort((a, b) => a._sortIndex - b._sortIndex);
        newSprites.forEach(s => delete s._sortIndex);
        
        // Clean up original image blob
        URL.revokeObjectURL(pendingImportImage.objectURL);
        
        confirmImportBtn.disabled = false;
        confirmImportBtn.textContent = 'Import';
        
    } else {
        // Add as single image
        newSprites.push({
            name: baseName,
            image: img,
            objectURL: pendingImportImage.objectURL,
            width: img.width,
            height: img.height
        });
    }
    
    if (newSprites.length === 0) {
        showToast('No sprites to import', true);
        closeImportModal(false);
        return;
    }
    
    // Insert at specified position (clamp and sync input value)
    const rawIdx = parseInt(insertIndexInput.value) || 0;
    const clampedIdx = Math.min(Math.max(0, rawIdx), sprites.length);
    insertIndexInput.value = clampedIdx;
    const insertIdx = insertPosition === 'end' ? sprites.length :
                     insertPosition === 'start' ? 0 : clampedIdx;
    
    sprites.splice(insertIdx, 0, ...newSprites);
    
    // Auto-populate sheet name from imported file (only if still default)
    if (sheetNameInput.value === 'spritesheet' || sheetNameInput.value === '') {
        // Clean up the base name for use as sheet name
        const cleanName = baseName
            .replace(/_\d+$/, '')           // Remove trailing _000 style suffixes
            .replace(/[-_]?sheet$/i, '')    // Remove 'sheet' suffix
            .replace(/[-_]?sprites?$/i, '') // Remove 'sprite(s)' suffix
            .trim();
        if (cleanName) {
            sheetNameInput.value = cleanName;
        }
    }
    
    renderSpritesGrid();
    updateAll();
    showToast(`Imported ${newSprites.length} sprite(s)`);
    closeImportModal(true);
}

function calculateSliceGrid(imgW, imgH, sliceW, sliceH, spacingX, spacingY, offsetX, offsetY) {
    const availW = imgW - offsetX;
    const availH = imgH - offsetY;
    if (availW < sliceW || availH < sliceH) return { cols: 0, rows: 0 };
    const cols = Math.max(0, Math.floor((availW + spacingX) / (sliceW + spacingX)));
    const rows = Math.max(0, Math.floor((availH + spacingY) / (sliceH + spacingY)));
    return { cols, rows };
}

function isTileEmpty(ctx, w, h) {
    // Sample edges + center cross pattern for hollow shape detection
    const samples = [
        // Corners
        [0, 0], [w-1, 0], [0, h-1], [w-1, h-1],
        // Center
        [Math.floor(w/2), Math.floor(h/2)],
        // Edge midpoints (catches frames/outlines)
        [Math.floor(w/2), 0], [Math.floor(w/2), h-1],
        [0, Math.floor(h/2)], [w-1, Math.floor(h/2)]
    ];
    for (const [x, y] of samples) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        if (pixel[3] > 0) return false;
    }
    // If all samples transparent, do sparse scan (every 4th pixel)
    const imageData = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < imageData.length; i += 16) { // every 4th pixel's alpha
        if (imageData[i] > 0) return false;
    }
    return true;
}

// Import modal event listeners
modalClose.addEventListener('click', () => closeImportModal());
cancelImportBtn.addEventListener('click', () => closeImportModal());
confirmImportBtn.addEventListener('click', performImport);

importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && importModal.classList.contains('show')) {
        closeImportModal();
    }
});

document.querySelectorAll('.import-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.import-mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        importMode = tab.dataset.mode;
        $('sliceMode').style.display = importMode === 'slice' ? 'block' : 'none';
        $('singleMode').style.display = importMode === 'single' ? 'block' : 'none';
    });
});

document.querySelectorAll('.insert-pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.insert-pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        insertPosition = btn.dataset.pos;
        insertIndexWrap.classList.toggle('show', insertPosition === 'index');
        // Reset index to end of list when switching away from "At Index"
        if (insertPosition !== 'index') {
            insertIndexInput.value = sprites.length;
        }
    });
});

[sliceWidthInput, sliceHeightInput, sliceSpacingXInput, sliceSpacingYInput, sliceOffsetXInput, sliceOffsetYInput].forEach(input => {
    input.addEventListener('input', updateImportPreview);
});

skipEmptyToggle.addEventListener('change', () => {
    skipEmptyHint.style.display = skipEmptyToggle.checked ? 'block' : 'none';
});

// ============================================================================
// Auto-detect Grid
// ============================================================================

autoDetectBtn.addEventListener('click', () => {
    if (!pendingImportImage) return;
    
    autoDetectBtn.disabled = true;
    autoDetectBtn.textContent = 'Detecting...';
    detectResult.style.display = 'none';
    
    // Use setTimeout to let UI update before heavy computation
    setTimeout(() => {
        const result = autoDetectGrid(pendingImportImage.img);
        const confidencePct = Math.round(result.confidence * 100);
        
        // Show result panel
        detectResult.style.display = 'block';
        detectResultText.textContent = `${result.sliceW}×${result.sliceH}`;
        if (result.spacingX > 0 || result.spacingY > 0) {
            detectResultText.textContent += ` +${result.spacingX}/${result.spacingY}px`;
        }
        detectConfidence.textContent = `${confidencePct}%`;
        
        // Color code confidence
        if (result.confidence >= 0.7) {
            detectConfidence.style.color = 'var(--accent)'; // high confidence
            detectResult.style.borderColor = 'var(--accent-glow)';
        } else if (result.confidence >= 0.3) {
            detectConfidence.style.color = '#fee440'; // yellow - medium
            detectResult.style.borderColor = 'rgba(254, 228, 64, 0.5)';
        } else {
            detectConfidence.style.color = '#f72585'; // magenta - low
            detectResult.style.borderColor = 'rgba(247, 37, 133, 0.5)';
        }
        
        if (result.confidence > 0.3) {
            sliceWidthInput.value = result.sliceW;
            sliceHeightInput.value = result.sliceH;
            sliceSpacingXInput.value = result.spacingX;
            sliceSpacingYInput.value = result.spacingY;
            sliceOffsetXInput.value = result.offsetX;
            sliceOffsetYInput.value = result.offsetY;
            updateImportPreview();
            showToast(`Detected ${result.sliceW}×${result.sliceH} grid`);
        } else {
            showToast('Detection uncertain - adjust manually', true);
        }
        
        autoDetectBtn.disabled = false;
        autoDetectBtn.textContent = '✨ Auto-detect Grid';
    }, 10);
});

function autoDetectGrid(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const w = img.width;
    const h = img.height;
    
    // Calculate transparency ratio for each row and column
    // Using 0.995 threshold - "mostly transparent" to handle anti-aliasing
    const TRANSPARENT_THRESHOLD = 0.995;
    const ALPHA_THRESHOLD = 10; // Consider alpha < 10 as transparent
    
    const rowTransparency = [];
    for (let y = 0; y < h; y++) {
        let transparentPixels = 0;
        for (let x = 0; x < w; x++) {
            const alpha = data[(y * w + x) * 4 + 3];
            if (alpha < ALPHA_THRESHOLD) transparentPixels++;
        }
        rowTransparency.push(transparentPixels / w);
    }
    
    const colTransparency = [];
    for (let x = 0; x < w; x++) {
        let transparentPixels = 0;
        for (let y = 0; y < h; y++) {
            const alpha = data[(y * w + x) * 4 + 3];
            if (alpha < ALPHA_THRESHOLD) transparentPixels++;
        }
        colTransparency.push(transparentPixels / h);
    }
    
    // Find "gap" lines (mostly transparent)
    const rowGaps = rowTransparency.map((t, i) => ({ index: i, isGap: t >= TRANSPARENT_THRESHOLD }));
    const colGaps = colTransparency.map((t, i) => ({ index: i, isGap: t >= TRANSPARENT_THRESHOLD }));
    
    // Detect pattern from gaps
    const rowPattern = detectGridPattern(rowGaps, h);
    const colPattern = detectGridPattern(colGaps, w);
    
    return {
        sliceW: colPattern.cellSize > 0 ? colPattern.cellSize : tileSize,
        sliceH: rowPattern.cellSize > 0 ? rowPattern.cellSize : tileSize,
        spacingX: colPattern.spacing,
        spacingY: rowPattern.spacing,
        offsetX: colPattern.offset,
        offsetY: rowPattern.offset,
        confidence: (rowPattern.confidence + colPattern.confidence) / 2
    };
}

function detectGridPattern(gaps, totalSize) {
    if (gaps.length === 0) {
        return { cellSize: totalSize, spacing: 0, offset: 0, confidence: 0 };
    }
    
    // Find runs of gaps and content
    const runs = [];
    let currentType = gaps[0].isGap ? 'gap' : 'content';
    let runStart = 0;
    
    for (let i = 1; i < gaps.length; i++) {
        const type = gaps[i].isGap ? 'gap' : 'content';
        
        if (type !== currentType) {
            runs.push({ type: currentType, start: runStart, length: i - runStart });
            currentType = type;
            runStart = i;
        }
    }
    // Close the final run
    runs.push({ type: currentType, start: runStart, length: gaps.length - runStart });
    
    // Filter to get content runs (these are our tiles)
    const contentRuns = runs.filter(r => r.type === 'content');
    const gapRuns = runs.filter(r => r.type === 'gap');
    
    if (contentRuns.length === 0) {
        return { cellSize: totalSize, spacing: 0, offset: 0, confidence: 0 };
    }
    
    // Single content run = not a grid, very low confidence
    if (contentRuns.length === 1) {
        return { 
            cellSize: contentRuns[0].length, 
            spacing: 0, 
            offset: contentRuns[0].start, 
            confidence: 0.1 
        };
    }
    
    // Find most common content run length (this is our cell size)
    const contentLengths = contentRuns.map(r => r.length);
    const cellSize = findMostCommon(contentLengths) || contentLengths[0];
    
    // Find most common gap length (this is our spacing)
    // Exclude first and last gaps (margins)
    const innerGapRuns = gapRuns.filter(r => {
        // Only include gaps that are between content runs (not edge margins)
        const gapEnd = r.start + r.length;
        const hasContentBefore = contentRuns.some(c => c.start + c.length <= r.start);
        const hasContentAfter = contentRuns.some(c => c.start >= gapEnd);
        return hasContentBefore && hasContentAfter;
    });
    const gapLengths = innerGapRuns.map(r => r.length);
    const spacing = gapLengths.length > 0 ? (findMostCommon(gapLengths) || 0) : 0;
    
    // Offset is the start of first content
    const offset = contentRuns[0].start;
    
    // Calculate confidence based on consistency
    const cellSizeConsistency = contentLengths.filter(l => Math.abs(l - cellSize) <= 1).length / contentLengths.length;
    const spacingConsistency = gapLengths.length > 0 
        ? gapLengths.filter(l => Math.abs(l - spacing) <= 1).length / gapLengths.length 
        : 1;
    
    // Higher confidence if we found multiple consistent tiles
    // Scale: 2 tiles = 0.25, 4+ tiles = 1.0
    const countBonus = Math.min((contentRuns.length - 1) / 3, 1);
    const confidence = (cellSizeConsistency * 0.4 + spacingConsistency * 0.3 + countBonus * 0.3);
    
    return { cellSize, spacing, offset, confidence };
}

function findMostCommon(arr) {
    if (arr.length === 0) return null;
    const counts = {};
    let maxCount = 0;
    let mostCommon = arr[0];
    
    for (const val of arr) {
        // Group similar values (within ±1) to handle anti-aliasing variance
        const key = Math.round(val);
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > maxCount) {
            maxCount = counts[key];
            mostCommon = key;
        }
    }
    return mostCommon;
}

// ============================================================================
// Sprites Grid Rendering
// ============================================================================

function renderSpritesGrid() {
    if (sprites.length === 0) { 
        spritesGrid.innerHTML = '<div class="empty-state">No sprites loaded</div>'; 
        generateBtn.disabled = true; 
        return; 
    }
    generateBtn.disabled = false;
    spritesGrid.innerHTML = '';
    sprites.forEach((sprite, index) => {
        const item = document.createElement('div');
        item.className = 'sprite-item';
        item.draggable = true;
        item.dataset.index = index;

        const canvas = document.createElement('canvas');
        const displaySize = Math.max(40, Math.min(56, tileSize * 1.5));
        canvas.width = canvas.height = displaySize;
        canvas.style.width = canvas.style.height = displaySize + 'px';
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const scale = Math.min(displaySize / sprite.width, displaySize / sprite.height);
        const w = sprite.width * scale, h = sprite.height * scale;
        ctx.drawImage(sprite.image, (displaySize - w) / 2, (displaySize - h) / 2, w, h);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'sprite-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = e => { e.stopPropagation(); removeSprite(index); };

        const indexLabel = document.createElement('span');
        indexLabel.className = 'sprite-index';
        indexLabel.textContent = index;

        item.appendChild(canvas);
        item.appendChild(removeBtn);
        item.appendChild(indexLabel);

        item.addEventListener('dragstart', e => { draggedIndex = index; item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        item.addEventListener('dragend', () => { draggedIndex = null; item.classList.remove('dragging'); clearDropIndicators(); });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            if (draggedIndex === null || draggedIndex === index) return;
            const rect = item.getBoundingClientRect();
            clearDropIndicators();
            item.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drag-over-left' : 'drag-over-right');
        });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over-left', 'drag-over-right'));
        item.addEventListener('drop', e => {
            e.preventDefault();
            if (draggedIndex === null || draggedIndex === index) return;
            const rect = item.getBoundingClientRect();
            let targetIndex = index + (e.clientX < rect.left + rect.width / 2 ? 0 : 1);
            if (draggedIndex < targetIndex) targetIndex--;
            reorderSprites(draggedIndex, targetIndex);
            clearDropIndicators();
        });
        spritesGrid.appendChild(item);
    });
}

function clearDropIndicators() { 
    document.querySelectorAll('.sprite-item').forEach(el => el.classList.remove('drag-over-left', 'drag-over-right')); 
}

function removeSprite(index) {
    revokeSprite(sprites.splice(index, 1)[0]);
    renderSpritesGrid();
    updateAll();
    if (sprites.length === 0) {
        previewCanvas.style.display = 'none';
        previewEmpty.style.display = 'block';
        dimensionDisplay.style.display = 'none';
        downloadPngBtn.disabled = downloadJsonBtn.disabled = true;
        generatedCanvas = generatedMetadata = null;
    } else if (generatedCanvas) generateSheet();
}

function reorderSprites(from, to) {
    if (from === to) return;
    sprites.splice(to, 0, sprites.splice(from, 1)[0]);
    renderSpritesGrid();
    if (generatedCanvas) generateSheet();
}

// ============================================================================
// Stats & Validation
// ============================================================================

function updateStats() {
    const layout = calculateLayout();
    spriteCountEl.textContent = sprites.length;
    rowCountEl.textContent = layout.rows;
}

function checkSizeMismatches() {
    const mismatched = sprites.filter(s => s.width !== tileSize || s.height !== tileSize);
    if (mismatched.length > 0) {
        mismatchCountEl.textContent = mismatched.length;
        expectedSizeEl.textContent = tileSize + '×' + tileSize;
        sizeWarning.classList.add('show');
    } else sizeWarning.classList.remove('show');
}

function checkGpuLimits() {
    if (sprites.length === 0) { gpuWarning.classList.remove('show'); return; }
    const layout = calculateLayout();
    const maxDim = Math.max(layout.width, layout.height);
    if (maxDim > 8192) { 
        gpuLimitEl.textContent = maxDim > 16384 ? '16384' : '8192'; 
        gpuWarning.classList.add('show'); 
    } else gpuWarning.classList.remove('show');
}

function updateAll() { 
    updateStats(); 
    checkSizeMismatches(); 
    checkGpuLimits(); 
    if (sprites.length > 0 && generatedCanvas) generateSheet(); 
}

// ============================================================================
// Layout Calculation
// ============================================================================

function calculateLayout() {
    // NOTE: cols is for calculating sheet dimensions, but sprite positioning
    // uses maxCols for wrapping. This is intentional - sprites wrap at maxCols
    // regardless of how many columns the final row has. If adding "auto columns"
    // or "tight pack" modes later, centralize the wrap value here.
    const count = sprites.length || 0;
    const cellSize = tileSize + padding * 2;
    const cols = count > 0 ? Math.min(count, maxCols) : 0;
    const rows = count > 0 ? Math.ceil(count / maxCols) : 0;
    return { cols, rows, width: cols * cellSize, height: rows * cellSize, cellSize, wrapAt: maxCols };
}

// ============================================================================
// Sheet Generation
// ============================================================================

function generateSheet() {
    if (sprites.length === 0) return;
    const { cols, rows, width, height, cellSize, wrapAt } = calculateLayout();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const metadata = { tileSize, padding, columns: cols, rows, width, height, sprites: [], nameToIndex: {} };

    sprites.forEach((sprite, index) => {
        const col = index % wrapAt, row = Math.floor(index / wrapAt);
        const cellX = col * cellSize, cellY = row * cellSize;
        const x = cellX + padding, y = cellY + padding;
        let drawX = x, drawY = y, drawW = tileSize, drawH = tileSize;

        if (autoFit) {
            const scale = Math.min(tileSize / sprite.width, tileSize / sprite.height, 1);
            drawW = sprite.width * scale;
            drawH = sprite.height * scale;
            drawX = x + (tileSize - drawW) / 2;
            drawY = y + (tileSize - drawH) / 2;
            ctx.drawImage(sprite.image, drawX, drawY, drawW, drawH);
        } else {
            const srcX = Math.max(0, (sprite.width - tileSize) / 2);
            const srcY = Math.max(0, (sprite.height - tileSize) / 2);
            const srcW = Math.min(sprite.width, tileSize);
            const srcH = Math.min(sprite.height, tileSize);
            drawW = srcW; drawH = srcH;
            drawX = x + (tileSize - drawW) / 2;
            drawY = y + (tileSize - drawH) / 2;
            ctx.drawImage(sprite.image, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);
        }

        if (extrudeEdges && padding > 0) {
            ctx.drawImage(canvas, drawX, drawY, drawW, 1, drawX, drawY - 1, drawW, 1);
            ctx.drawImage(canvas, drawX, drawY + drawH - 1, drawW, 1, drawX, drawY + drawH, drawW, 1);
            ctx.drawImage(canvas, drawX, drawY, 1, drawH, drawX - 1, drawY, 1, drawH);
            ctx.drawImage(canvas, drawX + drawW - 1, drawY, 1, drawH, drawX + drawW, drawY, 1, drawH);
        }

        metadata.sprites.push({
            index,
            name: sprite.name,
            x, y,
            width: tileSize,
            height: tileSize,
            originalWidth: sprite.width,
            originalHeight: sprite.height,
            // Unity-compatible fields
            rect: { x, y: height - y - tileSize, width: tileSize, height: tileSize }, // Unity Y is bottom-up
            pivot: { x: 0.5, y: 0.5 }
        });
        metadata.nameToIndex[sprite.name] = index;
    });

    previewCanvas.width = width;
    previewCanvas.height = height;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(canvas, 0, 0);
    const maxPreviewSize = 480;
    const previewScale = Math.min(maxPreviewSize / width, maxPreviewSize / height, 4);
    previewCanvas.style.width = (width * previewScale) + 'px';
    previewCanvas.style.height = (height * previewScale) + 'px';
    previewCanvas.style.display = 'block';
    previewEmpty.style.display = 'none';
    dimensionDisplay.style.display = 'flex';
    sheetWidthEl.textContent = width;
    sheetHeightEl.textContent = height;
    generatedCanvas = canvas;
    generatedMetadata = metadata;
    downloadPngBtn.disabled = downloadJsonBtn.disabled = false;
    checkGpuLimits();
    showToast('Generated ' + width + '×' + height);
}

// ============================================================================
// Export Functions
// ============================================================================

function getExportName() {
    let name = sheetNameInput.value.trim() || 'spritesheet';
    // Sanitize: remove unsafe chars, collapse whitespace/special to underscores
    name = name
        .replace(/[<>:"/\\|?*]/g, '')      // Remove Windows-unsafe chars
        .replace(/[\s\-\.]+/g, '_')        // Collapse spaces, dashes, dots to underscore
        .replace(/_+/g, '_')               // Collapse multiple underscores
        .replace(/^_|_$/g, '');            // Trim leading/trailing underscores
    return (name || 'spritesheet') + '_' + tileSize + 'x' + tileSize;
}

function downloadPng() {
    if (!generatedCanvas) return;
    downloadPngBtn.disabled = true;
    downloadPngBtn.textContent = '...';
    generatedCanvas.toBlob(blob => {
        if (!blob) { showToast('Export failed', true); resetDownloadButtons(); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = getExportName() + '.png';
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('PNG downloaded');
        resetDownloadButtons();
    }, 'image/png');
}

function downloadJson() {
    if (!generatedMetadata) return;
    const blob = new Blob([JSON.stringify(generatedMetadata, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = getExportName() + '.json';
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('JSON downloaded');
}

function resetDownloadButtons() { 
    downloadPngBtn.disabled = !generatedCanvas; 
    downloadPngBtn.textContent = 'PNG'; 
}

// ============================================================================
// Clear All
// ============================================================================

function clearAll() {
    sprites.forEach(revokeSprite);
    sprites = [];
    generatedCanvas = generatedMetadata = null;
    renderSpritesGrid();
    updateStats();
    sizeWarning.classList.remove('show');
    gpuWarning.classList.remove('show');
    previewCanvas.style.display = 'none';
    previewEmpty.style.display = 'block';
    dimensionDisplay.style.display = 'none';
    downloadPngBtn.disabled = downloadJsonBtn.disabled = true;
    showToast('Cleared');
}

// ============================================================================
// Toast Notifications
// ============================================================================

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================================
// Event Bindings
// ============================================================================

generateBtn.addEventListener('click', generateSheet);
downloadPngBtn.addEventListener('click', downloadPng);
downloadJsonBtn.addEventListener('click', downloadJson);
clearBtn.addEventListener('click', clearAll);

// ============================================================================
// Initialize
// ============================================================================

updateStats();
