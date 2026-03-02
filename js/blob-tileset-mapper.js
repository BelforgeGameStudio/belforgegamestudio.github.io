// ============================================
// Blob Tileset Mapper — Tool Logic
// ============================================
// Depends on: js/utils.js (provides N, NE, E, SE, S, SW, W, NW,
//   DIR_NAMES, CELL_TO_BIT, BIT_TO_CELL, DIAGONAL_REQUIREMENTS,
//   VALID_BITMASKS, calculateBitmask, applyDiagonalGating,
//   describeBitmask, isFullyTransparent, showToast, copyToClipboard,
//   downloadFile)

// ============================================
// STATE
// ============================================

let spriteSheet = null;
let sprites = [];
let mappings = {};
let reverseMappings = {};
let selectedSpriteIndex = null;
let previewGrid = new Array(49).fill(false);
let pendingURLMappings = null;
let variants255 = [];

// ============================================
// TEST PATTERN
// ============================================

const TEST_GRID_COLS = 17;
const TEST_GRID_ROWS = 8;

// Optimized 17x8 pattern that produces all 47 unique reduced bitmask values
const DEFAULT_TEST_PATTERN = [
    1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1,
    1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1,
    1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0,
    1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0,
    1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0,
    1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0,
    1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1
];

let testPatternGrid = [...DEFAULT_TEST_PATTERN];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initDropZone();
    initBitmaskGrid();
    initPreviewGrid();
    initShowcaseGrid();
    initTestPatternGrid();
    loadFromURL();
    loadFromLocalStorage();
    updateMissingList();
});

function initDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'image/png') {
            loadImage(file);
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadImage(file);
    });
}

function initBitmaskGrid() {
    const grid = document.getElementById('bitmask-grid');
    grid.innerHTML = '';

    VALID_BITMASKS.forEach(value => {
        const item = createBitmaskItem(value);
        grid.appendChild(item);
    });

    // 48th slot: variant shortcut for bitmask 255
    const slot = document.createElement('div');
    slot.className = 'bitmask-item';
    slot.id = 'variant-slot';
    slot.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;';
    slot.title = 'Select a sprite and click to add a variant for bitmask 255';
    slot.innerHTML = '<div style="font-family:JetBrains Mono,monospace;font-size:14px;color:#666;">+V</div>';
    slot.addEventListener('click', onVariantSlotClick);
    grid.appendChild(slot);
}

function createBitmaskItem(bitmaskValue) {
    const item = document.createElement('div');
    item.className = 'bitmask-item';
    item.dataset.bitmask = bitmaskValue;

    const miniGrid = document.createElement('div');
    miniGrid.className = 'mini-grid';

    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';

        if (i === 4) {
            cell.classList.add('center');
        } else {
            const bit = CELL_TO_BIT[i];
            const isSet = (bitmaskValue & bit) !== 0;
            const isDiagonal = [NE, SE, SW, NW].includes(bit);

            if (isDiagonal) {
                const [req1, req2] = DIAGONAL_REQUIREMENTS[bit];
                const cardinalsPresent = (bitmaskValue & req1) && (bitmaskValue & req2);

                if (!cardinalsPresent) {
                    cell.classList.add('neighbor-disabled');
                } else {
                    cell.classList.add(isSet ? 'neighbor-on' : 'neighbor-off');
                }
            } else {
                cell.classList.add(isSet ? 'neighbor-on' : 'neighbor-off');
            }
        }

        miniGrid.appendChild(cell);
    }

    item.appendChild(miniGrid);

    const label = document.createElement('div');
    label.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:14px;line-height:1;color:#888;margin-top:1px;';
    label.textContent = bitmaskValue;
    item.appendChild(label);

    const preview = document.createElement('canvas');
    preview.className = 'bitmask-sprite-preview';
    preview.width = 29;
    preview.height = 29;
    preview.style.display = 'none';
    item.appendChild(preview);

    item.title = `Bitmask ${bitmaskValue}: ${describeBitmask(bitmaskValue)}`;
    item.addEventListener('click', () => onBitmaskClick(bitmaskValue));

    return item;
}

function initPreviewGrid() {
    const grid = document.getElementById('preview-grid');
    grid.innerHTML = '';

    for (let i = 0; i < 49; i++) {
        const cell = document.createElement('div');
        cell.className = 'sandbox-cell';
        cell.dataset.index = i;
        cell.addEventListener('click', () => togglePreviewCell(i));
        grid.appendChild(cell);
    }
}

function initShowcaseGrid() {
    const grid = document.getElementById('showcase-grid');
    grid.innerHTML = '';

    VALID_BITMASKS.forEach(bitmask => {
        const cell = document.createElement('div');
        cell.className = 'showcase-cell';
        cell.dataset.bitmask = bitmask;
        cell.addEventListener('click', () => scrollToBitmask(bitmask));
        grid.appendChild(cell);
    });

    updateShowcase();
}

function initTestPatternGrid() {
    const grid = document.getElementById('test-pattern-grid');
    grid.innerHTML = '';

    const totalCells = TEST_GRID_COLS * TEST_GRID_ROWS;
    if (testPatternGrid.length !== totalCells) {
        testPatternGrid = new Array(totalCells).fill(0);
    }

    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'test-cell';
        cell.dataset.index = i;
        cell.addEventListener('click', () => toggleTestPatternCell(i));
        grid.appendChild(cell);
    }

    updateTestPattern();
}

// ============================================
// IMAGE LOADING
// ============================================

function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            spriteSheet = img;
            sliceSpriteSheet();
            saveToLocalStorage();
        };
        img.src = e.target.result;
        localStorage.setItem('blobMapper_spriteSheetData', e.target.result);
    };
    reader.readAsDataURL(file);
}

function reloadSpriteSheet() {
    if (spriteSheet) {
        sliceSpriteSheet();
    }
}

function sliceSpriteSheet() {
    const tileW = parseInt(document.getElementById('tile-width').value);
    const tileH = parseInt(document.getElementById('tile-height').value);

    const cols = Math.floor(spriteSheet.width / tileW);
    const rows = Math.floor(spriteSheet.height / tileH);

    sprites = [];
    let spriteIndex = 0;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const canvas = document.createElement('canvas');
            canvas.width = tileW;
            canvas.height = tileH;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(spriteSheet, x * tileW, y * tileH, tileW, tileH, 0, 0, tileW, tileH);

            const imageData = ctx.getImageData(0, 0, tileW, tileH);

            if (!isFullyTransparent(imageData)) {
                sprites.push({
                    index: spriteIndex,
                    gridX: x,
                    gridY: y,
                    canvas: canvas,
                    imageData: imageData
                });
            }
            spriteIndex++;
        }
    }

    renderSpriteGrid();
    updateProgress();
    updateShowcase();
    updateTestPattern();
    updatePreview();
    updateMissingList();

    document.getElementById('sprite-count').textContent = `${sprites.length} sprites loaded`;
    document.getElementById('standard-layout-btn').classList.toggle('hidden', sprites.length < 47);
    showToast(`Loaded ${sprites.length} sprites from ${cols}\u00d7${rows} grid`);

    if (pendingURLMappings) {
        mappings = {};
        reverseMappings = {};
        for (const [bitmask, spriteIndex] of Object.entries(pendingURLMappings)) {
            mappings[parseInt(bitmask)] = spriteIndex;
            reverseMappings[spriteIndex] = parseInt(bitmask);
        }
        variants255.forEach(idx => { reverseMappings[idx] = 255; });
        pendingURLMappings = null;
        VALID_BITMASKS.forEach(v => updateBitmaskItem(v));
        updateVariantSlot();
        renderSpriteGrid();
        updateProgress();
        updatePreview();
        updateShowcase();
        updateTestPattern();
        updateMissingList();
        saveToLocalStorage();
        showToast(`Applied ${Object.keys(mappings).length} mappings from URL`);
    }
}

// ============================================
// SPRITE GRID RENDERING
// ============================================

function renderSpriteGrid() {
    const grid = document.getElementById('sprite-grid');
    grid.innerHTML = '';

    const displaySize = parseInt(document.getElementById('display-zoom').value);
    const cols = displaySize <= 64 ? 6 : displaySize <= 80 ? 5 : 4;
    grid.style.gridTemplateColumns = `repeat(${cols}, ${displaySize}px)`;

    sprites.forEach((sprite) => {
        const tile = document.createElement('div');
        tile.className = 'sprite-tile';
        tile.dataset.spriteIndex = sprite.index;
        tile.style.width = displaySize + 'px';

        if (reverseMappings[sprite.index] !== undefined || variants255.includes(sprite.index)) {
            tile.classList.add('assigned');
        }

        if (selectedSpriteIndex === sprite.index) {
            tile.classList.add('selected');
        }

        const canvas = document.createElement('canvas');
        canvas.width = displaySize;
        canvas.height = displaySize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite.canvas, 0, 0, displaySize, displaySize);
        tile.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'bg-black/85 text-text font-mono text-2xs font-semibold text-center py-0.5 px-1';
        label.textContent = sprite.index;
        tile.appendChild(label);

        tile.addEventListener('click', () => onSpriteClick(sprite.index));
        tile.addEventListener('mouseenter', (e) => showSuggestions(sprite, e));
        tile.addEventListener('mouseleave', hideSuggestions);

        grid.appendChild(tile);
    });
}

// ============================================
// MAPPING LOGIC
// ============================================

function onSpriteClick(spriteIndex) {
    if (selectedSpriteIndex === spriteIndex) {
        selectedSpriteIndex = null;
    } else {
        selectedSpriteIndex = spriteIndex;
    }
    renderSpriteGrid();
    updateBitmaskHighlights();
}

function onBitmaskClick(bitmaskValue) {
    if (selectedSpriteIndex === null) {
        if (mappings[bitmaskValue] !== undefined) {
            const spriteIndex = mappings[bitmaskValue];
            delete reverseMappings[spriteIndex];
            delete mappings[bitmaskValue];
            if (bitmaskValue === 255) {
                variants255.forEach(idx => delete reverseMappings[idx]);
                variants255 = [];
            }
            updateBitmaskItem(bitmaskValue);
            updateVariantSlot();
            renderSpriteGrid();
            updateProgress();
            updatePreview();
            updateShowcase();
            updateTestPattern();
            updateMissingList();
            saveToLocalStorage();
            showToast(`Unmapped bitmask ${bitmaskValue}`);
        }
        return;
    }

    // For bitmask 255: if already mapped, add as variant instead of replacing
    if (bitmaskValue === 255 && mappings[255] !== undefined) {
        const prevBitmask = reverseMappings[selectedSpriteIndex];
        if (prevBitmask !== undefined) {
            if (prevBitmask === 255) {
                variants255 = variants255.filter(idx => idx !== selectedSpriteIndex);
                if (mappings[255] === selectedSpriteIndex) {
                    if (variants255.length > 0) {
                        mappings[255] = variants255.shift();
                    } else {
                        delete mappings[255];
                    }
                }
                delete reverseMappings[selectedSpriteIndex];
            } else {
                delete mappings[prevBitmask];
                updateBitmaskItem(prevBitmask);
            }
        }

        if (reverseMappings[selectedSpriteIndex] === undefined) {
            variants255.push(selectedSpriteIndex);
            reverseMappings[selectedSpriteIndex] = 255;
        }

        updateBitmaskItem(255);
        updateVariantSlot();
        selectedSpriteIndex = null;
        renderSpriteGrid();
        updateBitmaskHighlights();
        updateProgress();
        updatePreview();
        updateShowcase();
        updateTestPattern();
        updateMissingList();
        saveToLocalStorage();
        const total = 1 + variants255.length;
        showToast(`Bitmask 255 now has ${total} variant${total > 1 ? 's' : ''}`);
        return;
    }

    const prevBitmask = reverseMappings[selectedSpriteIndex];
    if (prevBitmask !== undefined) {
        if (prevBitmask === 255 && variants255.includes(selectedSpriteIndex)) {
            variants255 = variants255.filter(idx => idx !== selectedSpriteIndex);
        } else if (prevBitmask === 255 && mappings[255] === selectedSpriteIndex) {
            if (variants255.length > 0) {
                mappings[255] = variants255.shift();
            } else {
                delete mappings[255];
            }
            updateBitmaskItem(255);
            updateVariantSlot();
        } else {
            delete mappings[prevBitmask];
            updateBitmaskItem(prevBitmask);
        }
    }

    const prevSprite = mappings[bitmaskValue];
    if (prevSprite !== undefined) {
        delete reverseMappings[prevSprite];
    }

    mappings[bitmaskValue] = selectedSpriteIndex;
    reverseMappings[selectedSpriteIndex] = bitmaskValue;

    updateBitmaskItem(bitmaskValue);
    selectedSpriteIndex = null;
    renderSpriteGrid();
    updateBitmaskHighlights();
    updateProgress();
    updatePreview();
    updateShowcase();
    updateTestPattern();
    updateMissingList();
    saveToLocalStorage();

    showToast(`Mapped sprite ${mappings[bitmaskValue]} \u2192 bitmask ${bitmaskValue}`);
}

function updateBitmaskItem(bitmaskValue) {
    const item = document.querySelector(`.bitmask-item[data-bitmask="${bitmaskValue}"]`);
    if (!item) return;

    const preview = item.querySelector('.bitmask-sprite-preview');
    const spriteIndex = mappings[bitmaskValue];

    const existingBadge = item.querySelector('.variant-badge');
    if (existingBadge) existingBadge.remove();

    const miniGrid = item.querySelector('.mini-grid');
    if (spriteIndex !== undefined) {
        item.classList.add('assigned');
        const sprite = sprites.find(s => s.index === spriteIndex);
        if (sprite) {
            const ctx = preview.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, 29, 29);
            ctx.drawImage(sprite.canvas, 0, 0, 29, 29);
            preview.style.display = 'block';
            if (miniGrid) miniGrid.style.display = 'none';
        }
        if (bitmaskValue === 255 && variants255.length > 0) {
            const badge = document.createElement('div');
            badge.className = 'variant-badge';
            badge.style.cssText = 'position:absolute;top:1px;left:1px;background:#e85d04;color:#fff;font-size:7px;font-weight:700;padding:0 3px;border-radius:3px;line-height:12px;';
            badge.textContent = `+${variants255.length}`;
            item.style.position = 'relative';
            item.appendChild(badge);
        }
    } else {
        item.classList.remove('assigned');
        preview.style.display = 'none';
        if (miniGrid) miniGrid.style.display = '';
    }
}

function updateVariantSlot() {
    const slot = document.getElementById('variant-slot');
    if (!slot) return;

    const count = variants255.length;
    const has255 = mappings[255] !== undefined;

    if (has255 && count > 0) {
        slot.innerHTML = `<div style="font-family:JetBrains Mono,monospace;font-size:14px;font-weight:700;color:#e85d04;">+${count}</div>`;
        slot.title = `${count} variant${count > 1 ? 's' : ''} for bitmask 255. Click with a sprite selected to add more.`;
    } else if (has255) {
        slot.innerHTML = '<div style="font-family:JetBrains Mono,monospace;font-size:14px;color:#888;">+V</div>';
        slot.title = 'Select a sprite and click to add a variant for bitmask 255';
    } else {
        slot.innerHTML = '<div style="font-family:JetBrains Mono,monospace;font-size:14px;color:#444;">+V</div>';
        slot.title = 'Map bitmask 255 first, then add variants here';
    }
}

function onVariantSlotClick() {
    if (selectedSpriteIndex === null) {
        if (variants255.length > 0) {
            showToast(`Bitmask 255 has ${1 + variants255.length} variants. Select a sprite to add more.`);
        } else {
            showToast('Select a sprite first, then click here to add a 255 variant');
        }
        return;
    }
    if (mappings[255] === undefined) {
        showToast('Map bitmask 255 first before adding variants');
        return;
    }
    onBitmaskClick(255);
    updateVariantSlot();
}

function updateBitmaskHighlights() {
    document.querySelectorAll('.bitmask-item').forEach(item => {
        item.classList.remove('target');
    });
}

function updateProgress() {
    const mapped = Object.keys(mappings).length;
    document.getElementById('progress').textContent = `${mapped}/47 mapped`;
}

function deselectAll() {
    selectedSpriteIndex = null;
    renderSpriteGrid();
    updateBitmaskHighlights();
}

function applyStandardLayout() {
    if (sprites.length < 47) {
        showToast(`Need at least 47 sprites (have ${sprites.length})`);
        return;
    }
    mappings = {};
    reverseMappings = {};
    variants255 = [];
    for (let i = 0; i < 47; i++) {
        mappings[VALID_BITMASKS[i]] = sprites[i].index;
        reverseMappings[sprites[i].index] = VALID_BITMASKS[i];
    }
    VALID_BITMASKS.forEach(v => updateBitmaskItem(v));
    updateVariantSlot();
    renderSpriteGrid();
    updateProgress();
    updatePreview();
    updateShowcase();
    updateTestPattern();
    updateMissingList();
    saveToLocalStorage();
    showToast('Applied standard 47-tile layout');
}

function clearAllMappings() {
    if (confirm('Clear all mappings? This cannot be undone.')) {
        mappings = {};
        reverseMappings = {};
        variants255 = [];
        VALID_BITMASKS.forEach(v => updateBitmaskItem(v));
        updateVariantSlot();
        renderSpriteGrid();
        updateProgress();
        updatePreview();
        updateShowcase();
        updateTestPattern();
        updateMissingList();
        saveToLocalStorage();
        showToast('All mappings cleared');
    }
}

// ============================================
// AUTO-DETECT SUGGESTIONS
// ============================================

function analyzeSpritEdges(sprite) {
    const data = sprite.imageData.data;
    const w = sprite.canvas.width;
    const h = sprite.canvas.height;

    const regions = {
        [N]:  { x1: w * 0.25, y1: 0, x2: w * 0.75, y2: h * 0.25 },
        [S]:  { x1: w * 0.25, y1: h * 0.75, x2: w * 0.75, y2: h },
        [E]:  { x1: w * 0.75, y1: h * 0.25, x2: w, y2: h * 0.75 },
        [W]:  { x1: 0, y1: h * 0.25, x2: w * 0.25, y2: h * 0.75 },
        [NE]: { x1: w * 0.75, y1: 0, x2: w, y2: h * 0.25 },
        [NW]: { x1: 0, y1: 0, x2: w * 0.25, y2: h * 0.25 },
        [SE]: { x1: w * 0.75, y1: h * 0.75, x2: w, y2: h },
        [SW]: { x1: 0, y1: h * 0.75, x2: w * 0.25, y2: h }
    };

    const edgeScores = {};

    for (const [dir, region] of Object.entries(regions)) {
        let totalPixels = 0;
        let opaquePixels = 0;

        for (let y = Math.floor(region.y1); y < Math.floor(region.y2); y++) {
            for (let x = Math.floor(region.x1); x < Math.floor(region.x2); x++) {
                const idx = (y * w + x) * 4;
                totalPixels++;
                if (data[idx + 3] > 128) opaquePixels++;
            }
        }

        edgeScores[dir] = totalPixels > 0 ? opaquePixels / totalPixels : 0;
    }

    return edgeScores;
}

function getSuggestions(sprite) {
    const edgeScores = analyzeSpritEdges(sprite);
    const threshold = 0.5;

    const detectedEdges = {};
    for (const [dir, score] of Object.entries(edgeScores)) {
        detectedEdges[dir] = score > threshold;
    }

    const scores = [];

    for (const bitmask of VALID_BITMASKS) {
        if (mappings[bitmask] !== undefined) continue;

        let matchScore = 0;
        let totalChecks = 0;

        for (const dir of [N, E, S, W, NE, SE, SW, NW]) {
            const bitmaskHasDir = (bitmask & dir) !== 0;
            const spriteHasDir = detectedEdges[dir];

            const isDiagonal = [NE, SE, SW, NW].includes(dir);
            if (isDiagonal) {
                const [req1, req2] = DIAGONAL_REQUIREMENTS[dir];
                const cardinalsPresent = (bitmask & req1) && (bitmask & req2);
                if (!cardinalsPresent) continue;
            }

            if (bitmaskHasDir === spriteHasDir) {
                matchScore += 1;
            }
            totalChecks++;
        }

        if (totalChecks > 0) {
            scores.push({
                bitmask: bitmask,
                confidence: matchScore / totalChecks
            });
        }
    }

    scores.sort((a, b) => b.confidence - a.confidence);
    return scores.slice(0, 3);
}

function showSuggestions(sprite, event) {
    if (reverseMappings[sprite.index] !== undefined) return;

    const suggestions = getSuggestions(sprite);
    if (suggestions.length === 0) return;

    const tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = `
        <div class="text-2xs text-accent uppercase tracking-wider mb-1.5">Suggested matches</div>
        ${suggestions.map(s => `
            <div class="flex items-center justify-between gap-2 text-xs py-0.5">
                <span>Bitmask ${s.bitmask}</span>
                <span class="text-accent font-semibold">${Math.round(s.confidence * 100)}%</span>
            </div>
        `).join('')}
    `;

    tooltip.classList.remove('hidden');
    tooltip.style.left = (event.pageX + 15) + 'px';
    tooltip.style.top = (event.pageY + 15) + 'px';
}

function hideSuggestions() {
    document.getElementById('tooltip').classList.add('hidden');
}

// ============================================
// PREVIEW GRID (Sandbox)
// ============================================

function togglePreviewCell(index) {
    previewGrid[index] = !previewGrid[index];
    updatePreview();
}

function clearPreview() {
    previewGrid.fill(false);
    updatePreview();
}

function fillPreview() {
    previewGrid.fill(true);
    updatePreview();
}

function randomPreview() {
    previewGrid = previewGrid.map(() => Math.random() > 0.5);
    updatePreview();
}

function getSpriteForBitmask(bitmaskValue) {
    const primary = mappings[bitmaskValue];
    if (primary === undefined) return undefined;
    if (bitmaskValue === 255 && variants255.length > 0) {
        const all = [primary, ...variants255];
        return all[Math.floor(Math.random() * all.length)];
    }
    return primary;
}

function updatePreview() {
    const cells = document.querySelectorAll('#preview-grid .sandbox-cell');

    cells.forEach((cell, i) => {
        cell.innerHTML = '';
        cell.classList.remove('active', 'unmapped');

        if (!previewGrid[i]) return;

        cell.classList.add('active');
        const bitmask = calculateBitmask(i, previewGrid, 7);
        const reducedBitmask = applyDiagonalGating(bitmask);
        const spriteIndex = getSpriteForBitmask(reducedBitmask);

        if (spriteIndex !== undefined) {
            const sprite = sprites.find(s => s.index === spriteIndex);
            if (sprite) {
                const canvas = document.createElement('canvas');
                canvas.width = 32;
                canvas.height = 32;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite.canvas, 0, 0, 32, 32);
                cell.appendChild(canvas);
            }
        } else {
            cell.classList.add('unmapped');
            const debug = document.createElement('div');
            debug.className = 'font-mono text-[8px] text-warning';
            debug.textContent = reducedBitmask;
            cell.appendChild(debug);
        }
    });
}

function updateShowcase() {
    const cells = document.querySelectorAll('#showcase-grid .showcase-cell');
    let mappedCount = 0;

    cells.forEach((cell) => {
        const bitmask = parseInt(cell.dataset.bitmask);
        cell.innerHTML = '';
        cell.classList.remove('unmapped');
        cell.title = `Bitmask ${bitmask}: ${describeBitmask(bitmask)}`;

        const spriteIndex = mappings[bitmask];

        if (spriteIndex !== undefined) {
            mappedCount++;
            const sprite = sprites.find(s => s.index === spriteIndex);
            if (sprite) {
                const canvas = document.createElement('canvas');
                canvas.width = 36;
                canvas.height = 36;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite.canvas, 0, 0, 36, 36);
                cell.appendChild(canvas);
            }
        } else {
            cell.classList.add('unmapped');
            const label = document.createElement('div');
            label.className = 'font-mono text-[9px] text-warning';
            label.textContent = bitmask;
            cell.appendChild(label);
        }
    });

    document.getElementById('test-coverage').textContent = `${mappedCount}/47 mapped`;
}

function updateTestPattern() {
    const cells = document.querySelectorAll('#test-pattern-grid .test-cell');
    const usedBitmasks = new Set();

    cells.forEach((cell, i) => {
        cell.innerHTML = '';
        cell.classList.remove('active', 'unmapped');

        if (!testPatternGrid[i]) return;

        cell.classList.add('active');
        const bitmask = calculateBitmask(i, testPatternGrid, TEST_GRID_COLS, TEST_GRID_ROWS);
        const reducedBitmask = applyDiagonalGating(bitmask);
        usedBitmasks.add(reducedBitmask);

        cell.title = `Bitmask ${reducedBitmask}`;
        cell.addEventListener('mouseenter', () => {
            const item = document.querySelector(`.bitmask-item[data-bitmask="${reducedBitmask}"]`);
            if (item) item.classList.add('target');
        });
        cell.addEventListener('mouseleave', () => {
            const item = document.querySelector(`.bitmask-item[data-bitmask="${reducedBitmask}"]`);
            if (item) item.classList.remove('target');
        });

        const spriteIndex = getSpriteForBitmask(reducedBitmask);

        if (spriteIndex !== undefined) {
            const sprite = sprites.find(s => s.index === spriteIndex);
            if (sprite) {
                const cellSize = cell.clientWidth || 45;
                const canvas = document.createElement('canvas');
                canvas.width = cellSize;
                canvas.height = cellSize;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite.canvas, 0, 0, cellSize, cellSize);
                cell.appendChild(canvas);
            }
        } else {
            cell.classList.add('unmapped');
            const debug = document.createElement('div');
            debug.className = 'font-mono text-[8px] text-warning';
            debug.textContent = reducedBitmask;
            cell.appendChild(debug);
        }
    });

    document.getElementById('pattern-coverage').textContent = `${usedBitmasks.size}/47 bitmasks used`;
}

function toggleTestPatternCell(index) {
    testPatternGrid[index] = testPatternGrid[index] ? 0 : 1;
    updateTestPattern();
}

function resetTestPattern() {
    testPatternGrid = [...DEFAULT_TEST_PATTERN];
    updateTestPattern();
}

function clearTestPattern() {
    testPatternGrid = new Array(TEST_GRID_COLS * TEST_GRID_ROWS).fill(0);
    updateTestPattern();
}

function fillTestPattern() {
    testPatternGrid = new Array(TEST_GRID_COLS * TEST_GRID_ROWS).fill(1);
    updateTestPattern();
}

function updateMissingList() {
    const missingList = document.getElementById('missing-list');
    const missing = VALID_BITMASKS.filter(v => mappings[v] === undefined);

    if (missing.length === 0) {
        missingList.innerHTML = '<em class="text-accent">\u2713 All 47 bitmasks mapped!</em>';
    } else {
        missingList.innerHTML = missing.map(v =>
            `<span class="missing-item" onclick="scrollToBitmask(${v})" title="${describeBitmask(v)}">${v}</span>`
        ).join('');
    }
}

function scrollToBitmask(bitmaskValue) {
    const item = document.querySelector(`.bitmask-item[data-bitmask="${bitmaskValue}"]`);
    if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.classList.add('target');
        setTimeout(() => item.classList.remove('target'), 2000);
    }
}

// ============================================
// EXPORT
// ============================================

function generateExport() {
    const format = document.getElementById('export-format').value;
    switch (format) {
        case 'csharp': generateCSharpExport(); break;
        case 'unity': generateUnityExport(); break;
        case 'godot': generateGodotExport(); break;
        case 'json': generateJSONExport(); break;
    }
}

function generateCSharpExport() {
    if (sprites.length === 0) {
        document.getElementById('export-output').textContent = '// No sprites loaded';
        return;
    }

    const lines = ['// Blob tileset bitmask mapping', '// Generated by Belforge Blob Tileset Mapper', ''];
    lines.push(`public const int TILES_PER_VARIANT = ${sprites.length};`);
    lines.push('');
    lines.push('// Maps sprite sheet position (index) to bitmask value');
    lines.push('public static readonly int[] BitmaskByPosition = {');

    const maxIndex = Math.max(...sprites.map(s => s.index));

    for (let i = 0; i <= maxIndex; i++) {
        const bitmask = reverseMappings[i];
        const sprite = sprites.find(s => s.index === i);

        if (sprite) {
            const value = bitmask !== undefined ? bitmask : -1;
            const comment = bitmask !== undefined ? describeBitmask(bitmask) : 'UNMAPPED';
            lines.push(`    ${value.toString().padStart(3)},  // pos ${i.toString().padStart(2)}: ${comment}`);
        }
    }

    lines.push('};');
    lines.push('');
    lines.push('// Maps bitmask value to sprite sheet position');
    lines.push('public static readonly Dictionary<int, int> PositionByBitmask = new Dictionary<int, int> {');

    const sortedMappings = Object.entries(mappings).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    for (const [bitmask, spriteIndex] of sortedMappings) {
        lines.push(`    { ${bitmask.toString().padStart(3)}, ${spriteIndex.toString().padStart(2)} },  // ${describeBitmask(parseInt(bitmask))}`);
    }

    lines.push('};');

    if (variants255.length > 0) {
        lines.push('');
        lines.push('// Variant sprite positions for bitmask 255 (all neighbors)');
        lines.push(`public static readonly int[] Variants255 = { ${[mappings[255], ...variants255].join(', ')} };`);
    }

    document.getElementById('export-output').textContent = lines.join('\n');
}

function generateUnityExport() {
    if (sprites.length === 0) {
        document.getElementById('export-output').textContent = '// No sprites loaded';
        return;
    }

    const tw = document.getElementById('tile-width').value;
    const th = document.getElementById('tile-height').value;
    const sortedMappings = Object.entries(mappings).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

    const lines = [
        '// Generated by Belforge Blob Tileset Mapper',
        '// Save as BlobTilesetData.cs in your Unity project',
        '',
        'using UnityEngine;',
        'using System.Collections.Generic;',
        '',
        '[CreateAssetMenu(fileName = "BlobTileset", menuName = "Tileset/Blob Tileset Data")]',
        'public class BlobTilesetData : ScriptableObject',
        '{',
        `    public int tileWidth = ${tw};`,
        `    public int tileHeight = ${th};`,
        '',
        '    // Bitmask value \u2192 sprite sheet index',
        '    public static readonly Dictionary<int, int> BitmaskToPosition = new Dictionary<int, int>',
        '    {'
    ];

    for (const [bitmask, spriteIndex] of sortedMappings) {
        lines.push(`        {{ ${bitmask.toString().padStart(3)}, ${spriteIndex.toString().padStart(2)} }},  // ${describeBitmask(parseInt(bitmask))}`);
    }

    lines.push('    };');
    lines.push('');
    lines.push('    // Sprite sheet index \u2192 bitmask value (-1 = unmapped)');
    lines.push('    public static readonly int[] PositionToBitmask = {');

    const maxIndex = Math.max(...sprites.map(s => s.index));
    for (let i = 0; i <= maxIndex; i++) {
        const bitmask = reverseMappings[i];
        const sprite = sprites.find(s => s.index === i);
        if (sprite) {
            const value = bitmask !== undefined ? bitmask : -1;
            lines.push(`        ${value.toString().padStart(3)},  // pos ${i}`);
        }
    }

    lines.push('    };');

    if (variants255.length > 0) {
        lines.push('');
        lines.push('    // Variant positions for bitmask 255 (all neighbors)');
        lines.push(`    public static readonly int[] Variants255 = { ${[mappings[255], ...variants255].join(', ')} };`);
    }

    lines.push('}');
    document.getElementById('export-output').textContent = lines.join('\n');
}

function generateGodotExport() {
    if (sprites.length === 0) {
        document.getElementById('export-output').textContent = '# No sprites loaded';
        return;
    }

    const tw = document.getElementById('tile-width').value;
    const th = document.getElementById('tile-height').value;
    const sortedMappings = Object.entries(mappings).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

    const lines = [
        '# Generated by Belforge Blob Tileset Mapper',
        `# Tile size: ${tw}x${th}`,
        '# Save as blob_tileset_data.tres in your Godot project',
        '# Requires a matching Resource script: blob_tileset_data.gd',
        '',
        '[gd_resource type="Resource" format=3]',
        '',
        '[resource]',
        `tile_width = ${tw}`,
        `tile_height = ${th}`,
        ''
    ];

    lines.push('# Bitmask value \u2192 sprite sheet index');
    lines.push('bitmask_to_position = {');
    for (const [bitmask, spriteIndex] of sortedMappings) {
        lines.push(`  ${bitmask}: ${spriteIndex},`);
    }
    lines.push('}');
    lines.push('');

    lines.push('# Sprite sheet index \u2192 bitmask value (-1 = unmapped)');
    const maxIndex = Math.max(...sprites.map(s => s.index));
    const posArray = [];
    for (let i = 0; i <= maxIndex; i++) {
        const sprite = sprites.find(s => s.index === i);
        if (sprite) {
            const bitmask = reverseMappings[i];
            posArray.push(bitmask !== undefined ? bitmask : -1);
        }
    }
    lines.push(`position_to_bitmask = [${posArray.join(', ')}]`);

    if (variants255.length > 0) {
        lines.push('');
        lines.push('# Variant positions for bitmask 255 (all neighbors)');
        lines.push(`variants_255 = [${[mappings[255], ...variants255].join(', ')}]`);
    }

    document.getElementById('export-output').textContent = lines.join('\n');
}

function generateJSONExport() {
    if (sprites.length === 0) {
        document.getElementById('export-output').textContent = '// No sprites loaded';
        return;
    }

    const data = {
        mappings: mappings,
        variants255: variants255,
        tileWidth: parseInt(document.getElementById('tile-width').value),
        tileHeight: parseInt(document.getElementById('tile-height').value),
        exportedAt: new Date().toISOString()
    };

    document.getElementById('export-output').textContent = JSON.stringify(data, null, 2);
}

function copyExport() {
    const output = document.getElementById('export-output').textContent;
    copyToClipboard(output);
}

// ============================================
// JSON IMPORT/EXPORT
// ============================================

function exportJSON() {
    const data = {
        mappings: mappings,
        variants255: variants255,
        tileWidth: parseInt(document.getElementById('tile-width').value),
        tileHeight: parseInt(document.getElementById('tile-height').value),
        exportedAt: new Date().toISOString()
    };

    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'blob-tileset-mapping.json', 'application/json');
    showToast('Mapping exported as JSON');
}

function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (data.tileWidth) document.getElementById('tile-width').value = data.tileWidth;
                if (data.tileHeight) document.getElementById('tile-height').value = data.tileHeight;

                if (data.mappings) {
                    mappings = {};
                    reverseMappings = {};
                    variants255 = [];

                    for (const [bitmask, spriteIndex] of Object.entries(data.mappings)) {
                        mappings[parseInt(bitmask)] = spriteIndex;
                        reverseMappings[spriteIndex] = parseInt(bitmask);
                    }

                    if (Array.isArray(data.variants255)) {
                        variants255 = data.variants255;
                        variants255.forEach(idx => { reverseMappings[idx] = 255; });
                    }

                    VALID_BITMASKS.forEach(v => updateBitmaskItem(v));
                    updateVariantSlot();
                    renderSpriteGrid();
                    updateProgress();
                    updatePreview();
                    updateShowcase();
                    updateTestPattern();
                    updateMissingList();
                    saveToLocalStorage();

                    showToast(`Imported ${Object.keys(mappings).length} mappings`);
                }
            } catch (err) {
                showToast('Error parsing JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

// ============================================
// URL SHARING
// ============================================

function generateShareURL() {
    const entries = Object.entries(mappings);
    if (entries.length === 0) {
        showToast('No mappings to share');
        return;
    }

    const m = entries.map(([b, s]) => `${b}:${s}`).join(',');
    const tw = document.getElementById('tile-width').value;
    const th = document.getElementById('tile-height').value;

    const url = new URL(window.location.href.split('?')[0]);
    url.searchParams.set('m', m);
    url.searchParams.set('tw', tw);
    url.searchParams.set('th', th);
    if (variants255.length > 0) {
        url.searchParams.set('v255', variants255.join(','));
    }

    history.replaceState(null, '', url);
    copyToClipboard(url.toString());
    showToast(`Copied share URL with ${entries.length} mappings`);
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('m');
    if (!m) return;

    const tw = params.get('tw');
    const th = params.get('th');
    if (tw) document.getElementById('tile-width').value = tw;
    if (th) document.getElementById('tile-height').value = th;

    const parsed = {};
    for (const pair of m.split(',')) {
        const [bitmask, spriteIndex] = pair.split(':').map(Number);
        if (!isNaN(bitmask) && !isNaN(spriteIndex)) {
            parsed[bitmask] = spriteIndex;
        }
    }

    const v255 = params.get('v255');
    if (v255) {
        variants255 = v255.split(',').map(Number).filter(n => !isNaN(n));
    }

    if (Object.keys(parsed).length > 0) {
        pendingURLMappings = parsed;
        showToast(`URL contains ${Object.keys(parsed).length} mappings \u2014 upload a sprite sheet to apply`);
    }
}

// ============================================
// LOCAL STORAGE
// ============================================

function saveToLocalStorage() {
    const data = {
        mappings: mappings,
        variants255: variants255,
        tileWidth: parseInt(document.getElementById('tile-width').value),
        tileHeight: parseInt(document.getElementById('tile-height').value)
    };
    localStorage.setItem('blobMapper_data', JSON.stringify(data));
}

function loadFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('blobMapper_data');
        if (savedData) {
            const data = JSON.parse(savedData);

            if (data.tileWidth) document.getElementById('tile-width').value = data.tileWidth;
            if (data.tileHeight) document.getElementById('tile-height').value = data.tileHeight;

            if (data.mappings) {
                mappings = {};
                reverseMappings = {};

                for (const [bitmask, spriteIndex] of Object.entries(data.mappings)) {
                    mappings[parseInt(bitmask)] = spriteIndex;
                    reverseMappings[spriteIndex] = parseInt(bitmask);
                }

                if (Array.isArray(data.variants255)) {
                    variants255 = data.variants255;
                    variants255.forEach(idx => { reverseMappings[idx] = 255; });
                }
            }
        }

        const spriteData = localStorage.getItem('blobMapper_spriteSheetData');
        if (spriteData) {
            const img = new Image();
            img.onload = () => {
                spriteSheet = img;
                sliceSpriteSheet();
            };
            img.src = spriteData;
        } else {
            VALID_BITMASKS.forEach(v => updateBitmaskItem(v));
            updateVariantSlot();
            updateProgress();
            updateShowcase();
            updateTestPattern();
            updateMissingList();
        }
    } catch (err) {
        console.error('Error loading from localStorage:', err);
    }
}
