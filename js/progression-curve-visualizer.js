/**
 * Progression Curve Visualizer
 * A browser-based tool for visualizing and comparing game progression curves.
 * 
 * @author Belforge Game Studio
 * @version 1.0.0
 */

(function() {
    'use strict';

    // ==========================================================================
    // Constants
    // ==========================================================================

    const COLORS = [
        '#e85d04', // orange (accent)
        '#06d6a0', // teal
        '#ef476f', // pink
        '#ffd166', // yellow
        '#118ab2', // blue
        '#9b5de5', // purple
        '#00f5d4', // cyan
        '#f15bb5', // magenta
    ];

    const MAX_CURVES = 8;
    const MAX_LEVEL_RANGE = 1000; // Prevent browser sadness

    const PRESETS = {
        'linear': { name: 'Linear', formula: 'base * level', desc: 'Constant growth per level' },
        'exponential': { name: 'Exponential', formula: 'base * 1.1 ** level', desc: 'Percentage growth compounds each level' },
        'polynomial': { name: 'Polynomial', formula: 'base * level ** 2', desc: 'Quadratic growth curve' },
        'logarithmic': { name: 'Logarithmic', formula: 'base * log2(level + 1)', desc: 'Fast early, slows down late' },
        'xp-curve': { name: 'XP Curve', formula: 'base * level ** 1.5', desc: 'Classic RPG leveling pattern' },
        'cost-scaling': { name: 'Cost Scaling', formula: 'base * 1.15 ** level', desc: 'Idle game upgrade costs' },
        'diminishing': { name: 'Diminishing Returns', formula: 'base * (1 - 0.99 ** level)', desc: 'Approaches cap asymptotically' },
        'soft-cap': { name: 'Soft Cap', formula: 'base * level / (level + 50) * 100', desc: 'Hyperbolic growth with soft ceiling' },
        'sigmoid': { name: 'Sigmoid', formula: 'base * 100 / (1 + 99 * 0.9 ** level)', desc: 'S-curve: slow start, fast middle, plateaus' },
        'smoothstep': { name: 'Smoothstep', formula: 'base * (3 * (level/100)**2 - 2 * (level/100)**3) * 100', desc: 'Smooth 0-1 transition curve' },
    };

    // ==========================================================================
    // State
    // ==========================================================================

    let curves = [];
    let nextCurveId = 1;
    let chart = null;
    let logScale = false;
    let viewMode = 'absolute'; // 'absolute' or 'growth'
    let statsCurveId = null; // Which curve to show stats for (null = first visible)
    let referenceLines = [1.0]; // Default baseline reference

    // Debounced chart update for formula input
    const debouncedUpdateChart = debounce(() => updateChart(), 200);

    // ==========================================================================
    // DOM References
    // ==========================================================================

    const dom = {
        baseValue: document.getElementById('baseValue'),
        minLevel: document.getElementById('minLevel'),
        maxLevel: document.getElementById('maxLevel'),
        presetSelect: document.getElementById('presetSelect'),
        curveList: document.getElementById('curveList'),
        addCurveBtn: document.getElementById('addCurveBtn'),
        resetBtn: document.getElementById('resetBtn'),
        curveChart: document.getElementById('curveChart'),
        chartEmpty: document.getElementById('chartEmpty'),
        statsSummary: document.getElementById('statsSummary'),
        statMinValue: document.getElementById('statMinValue'),
        statMaxValue: document.getElementById('statMaxValue'),
        statGrowthFactor: document.getElementById('statGrowthFactor'),
        statsCurveSelect: document.getElementById('statsCurveSelect'),
        logScaleToggle: document.getElementById('logScaleToggle'),
        viewModeSelect: document.getElementById('viewModeSelect'),
        refLineSection: document.getElementById('refLineSection'),
        refLineInput: document.getElementById('refLineInput'),
        refLineAddBtn: document.getElementById('refLineAddBtn'),
        refLineList: document.getElementById('refLineList'),
        tableToggle: document.getElementById('tableToggle'),
        tableContainer: document.getElementById('tableContainer'),
        tableHeader: document.getElementById('tableHeader'),
        tableBody: document.getElementById('tableBody'),
        exportCsvBtn: document.getElementById('exportCsvBtn'),
        exportJsonBtn: document.getElementById('exportJsonBtn'),
        exportPngBtn: document.getElementById('exportPngBtn'),
        toast: document.getElementById('toast'),
    };

    // ==========================================================================
    // Curve Management
    // ==========================================================================

    /**
     * Creates a new curve object.
     * @param {string} name - Curve name
     * @param {string} formula - Curve formula
     * @returns {object} Curve object
     */
    function createCurve(name, formula) {
        const colorIndex = curves.length % COLORS.length;
        return {
            id: nextCurveId++,
            name: name,
            formula: formula,
            color: COLORS[colorIndex],
            visible: true,
            error: null,
            data: [],
        };
    }

    /**
     * Adds a curve to the list.
     * @param {string} name - Curve name
     * @param {string} formula - Curve formula
     */
    function addCurve(name, formula) {
        if (curves.length >= MAX_CURVES) {
            showToast(`Maximum ${MAX_CURVES} curves allowed`, true);
            return;
        }
        
        const curve = createCurve(name, formula);
        curves.push(curve);
        renderCurveList();
        updateChart();
        updateAddButton();
    }

    /**
     * Removes a curve by ID.
     * @param {number} id - Curve ID
     */
    function removeCurve(id) {
        curves = curves.filter(c => c.id !== id);
        renderCurveList();
        updateChart();
        updateAddButton();
    }

    /**
     * Duplicates a curve by ID.
     * @param {number} id - Curve ID to duplicate
     */
    function duplicateCurve(id) {
        if (curves.length >= MAX_CURVES) {
            showToast(`Maximum ${MAX_CURVES} curves allowed`, true);
            return;
        }
        
        const source = curves.find(c => c.id === id);
        if (!source) return;
        
        const colorIndex = curves.length % COLORS.length;
        const newCurve = {
            id: nextCurveId++,
            name: source.name + ' (copy)',
            formula: source.formula,
            color: COLORS[colorIndex],
            visible: true,
            error: null,
            data: [],
        };
        
        // Insert after the source curve
        const sourceIndex = curves.findIndex(c => c.id === id);
        curves.splice(sourceIndex + 1, 0, newCurve);
        
        renderCurveList();
        updateChart();
        updateAddButton();
        showToast('Curve duplicated');
    }

    /**
     * Updates a curve's property.
     * @param {number} id - Curve ID
     * @param {string} prop - Property name
     * @param {*} value - New value
     */
    function updateCurve(id, prop, value) {
        const curve = curves.find(c => c.id === id);
        if (curve) {
            curve[prop] = value;
            if (prop === 'formula' || prop === 'visible') {
                updateChart();
            }
            if (prop === 'color') {
                updateChart();
            }
        }
    }

    /**
     * Updates the add curve button state.
     */
    function updateAddButton() {
        dom.addCurveBtn.disabled = curves.length >= MAX_CURVES;
    }

    // ==========================================================================
    // UI Rendering
    // ==========================================================================

    /**
     * Renders the curve list.
     */
    function renderCurveList() {
        if (curves.length === 0) {
            dom.curveList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No curves added yet</div>';
            return;
        }
        
        dom.curveList.innerHTML = curves.map(curve => `
            <div class="curve-item ${curve.visible ? '' : 'disabled'}" data-id="${curve.id}">
                <div class="curve-header">
                    <input type="color" class="curve-color" value="${curve.color}" data-action="color">
                    <input type="text" class="curve-name" value="${escapeHtml(curve.name)}" data-action="name">
                    <div class="curve-actions">
                        <button class="curve-action-btn duplicate" data-action="duplicate" title="Duplicate curve">📋</button>
                        <button class="curve-action-btn visibility ${curve.visible ? '' : 'hidden'}" data-action="visibility" title="Toggle visibility">
                            ${curve.visible ? '👁' : '👁‍🗨'}
                        </button>
                        <button class="curve-action-btn delete" data-action="delete" title="Remove curve">🗑</button>
                    </div>
                </div>
                <textarea class="curve-formula ${curve.error ? 'error' : ''}" data-action="formula">${escapeHtml(curve.formula)}</textarea>
                <div class="curve-error ${curve.error ? 'show' : ''}">${curve.error || ''}</div>
            </div>
        `).join('');
        
        // Add event listeners
        dom.curveList.querySelectorAll('.curve-item').forEach(item => {
            const id = parseInt(item.dataset.id);
            
            item.querySelector('[data-action="color"]').addEventListener('change', (e) => {
                updateCurve(id, 'color', e.target.value);
            });
            
            item.querySelector('[data-action="name"]').addEventListener('change', (e) => {
                updateCurve(id, 'name', e.target.value);
                updateChart(); // Update legend
            });
            
            item.querySelector('[data-action="formula"]').addEventListener('input', (e) => {
                const curve = curves.find(c => c.id === id);
                if (curve) curve.formula = e.target.value;
                debouncedUpdateChart();
            });
            
            item.querySelector('[data-action="visibility"]').addEventListener('click', () => {
                updateCurve(id, 'visible', !curves.find(c => c.id === id).visible);
                renderCurveList();
            });
            
            item.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
                duplicateCurve(id);
            });
            
            item.querySelector('[data-action="delete"]').addEventListener('click', () => {
                removeCurve(id);
            });
        });
    }

    // ==========================================================================
    // Chart Management
    // ==========================================================================

    /**
     * Transforms curve data based on current view mode.
     * @param {Array} data - Raw curve data
     * @returns {Array} Transformed data for display
     */
    function getDisplayData(data) {
        if (viewMode === 'absolute') {
            return data;
        }
        
        // Growth rate mode: value[n] / value[n-1]
        const growthData = [];
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                // First point has no previous, show as 1 (no growth)
                growthData.push(1);
            } else {
                const prev = data[i - 1];
                const curr = data[i];
                
                if (prev === 0 || !isFinite(prev)) {
                    // Can't divide by zero - show as null (gap in chart)
                    growthData.push(null);
                } else {
                    const ratio = curr / prev;
                    growthData.push(isFinite(ratio) ? ratio : null);
                }
            }
        }
        return growthData;
    }

    /**
     * Gets the Y-axis label based on current view mode.
     * @returns {string} Y-axis label
     */
    function getYAxisLabel() {
        if (viewMode === 'growth') {
            return 'Growth Rate (×)';
        }
        return 'Value' + (logScale ? ' (log)' : '');
    }

    /**
     * Chart.js plugin for drawing horizontal reference lines.
     */
    const referenceLinePlugin = {
        id: 'referenceLines',
        afterDraw: function(chart) {
            if (viewMode !== 'growth' || referenceLines.length === 0) return;
            
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const chartArea = chart.chartArea;
            
            referenceLines.forEach(value => {
                const y = yAxis.getPixelForValue(value);
                
                // Skip if outside chart area
                if (y < chartArea.top || y > chartArea.bottom) return;
                
                // Draw dashed line
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.moveTo(chartArea.left, y);
                ctx.lineTo(chartArea.right, y);
                ctx.stroke();
                
                // Draw label
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '10px JetBrains Mono';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(value.toFixed(2) + '×', chartArea.right - 4, y - 2);
                ctx.restore();
            });
        }
    };

    /**
     * Renders the reference line list UI.
     */
    function renderRefLineList() {
        if (!dom.refLineList) return;
        
        dom.refLineList.innerHTML = referenceLines.map(value => 
            `<span class="ref-line-tag" data-value="${value}">${value.toFixed(2)}× <button class="ref-line-remove">×</button></span>`
        ).join('');
        
        // Add click handlers for remove buttons
        dom.refLineList.querySelectorAll('.ref-line-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tag = e.target.closest('.ref-line-tag');
                const value = parseFloat(tag.dataset.value);
                removeRefLine(value);
            });
        });
    }

    /**
     * Adds a reference line.
     * @param {number} value - The Y value for the reference line
     */
    function addRefLine(value) {
        if (isNaN(value) || value <= 0) {
            showToast('Enter a valid positive number', true);
            return;
        }
        
        if (referenceLines.includes(value)) {
            showToast('Reference line already exists', true);
            return;
        }
        
        if (referenceLines.length >= 10) {
            showToast('Maximum 10 reference lines', true);
            return;
        }
        
        referenceLines.push(value);
        referenceLines.sort((a, b) => a - b);
        renderRefLineList();
        
        if (chart) {
            chart.update();
        }
    }

    /**
     * Removes a reference line.
     * @param {number} value - The Y value to remove
     */
    function removeRefLine(value) {
        referenceLines = referenceLines.filter(v => v !== value);
        renderRefLineList();
        
        if (chart) {
            chart.update();
        }
    }

    /**
     * Updates reference line section visibility based on view mode.
     */
    function updateRefLineSectionVisibility() {
        if (dom.refLineSection) {
            dom.refLineSection.style.display = viewMode === 'growth' ? 'block' : 'none';
        }
    }

    /**
     * Updates the stats curve selector dropdown.
     * @param {Array} visibleCurves - Array of visible curves
     */
    function updateStatsCurveSelect(visibleCurves) {
        if (!dom.statsCurveSelect) return;
        
        const currentValue = dom.statsCurveSelect.value;
        
        dom.statsCurveSelect.innerHTML = visibleCurves.map(curve => 
            `<option value="${curve.id}" ${curve.id === statsCurveId ? 'selected' : ''}>${escapeHtml(curve.name)}</option>`
        ).join('');
        
        // Restore selection if still valid
        if (visibleCurves.some(c => c.id === parseInt(currentValue))) {
            dom.statsCurveSelect.value = currentValue;
        }
    }

    /**
     * Updates the chart with current curve data.
     */
    function updateChart() {
        const base = parseFloat(dom.baseValue.value) || 10;
        let minLevel = parseInt(dom.minLevel.value) || 1;
        let maxLevel = parseInt(dom.maxLevel.value) || 100;
        
        if (minLevel >= maxLevel) {
            showToast('Min level must be less than max level', true);
            return;
        }
        
        // Guard against huge ranges
        if (maxLevel - minLevel > MAX_LEVEL_RANGE) {
            maxLevel = minLevel + MAX_LEVEL_RANGE;
            dom.maxLevel.value = maxLevel;
            showToast(`Range limited to ${MAX_LEVEL_RANGE} levels for performance`, true);
        }
        
        // Generate data for each curve
        const levels = [];
        for (let level = minLevel; level <= maxLevel; level++) {
            levels.push(level);
        }
        
        // Calculate values for each curve
        curves.forEach(curve => {
            curve.error = null;
            curve.data = [];
            
            if (!curve.formula.trim()) {
                curve.error = 'Formula is empty';
                return;
            }
            
            try {
                for (const level of levels) {
                    const value = safeEval(curve.formula, { base, level });
                    if (!isFinite(value)) {
                        throw new Error(`Invalid result at level ${level}`);
                    }
                    curve.data.push(value);
                }
            } catch (err) {
                curve.error = err.message;
                curve.data = [];
            }
        });
        
        // Re-render curve list to show errors (but not if user is typing in a formula)
        const activeElement = document.activeElement;
        const isTypingFormula = activeElement && activeElement.classList.contains('curve-formula');
        if (!isTypingFormula) {
            renderCurveList();
        } else {
            // Just update error states without full re-render
            curves.forEach(curve => {
                const item = dom.curveList.querySelector(`[data-id="${curve.id}"]`);
                if (item) {
                    const textarea = item.querySelector('.curve-formula');
                    const errorDiv = item.querySelector('.curve-error');
                    if (textarea) {
                        textarea.classList.toggle('error', !!curve.error);
                    }
                    if (errorDiv) {
                        errorDiv.classList.toggle('show', !!curve.error);
                        errorDiv.textContent = curve.error || '';
                    }
                }
            });
        }
        
        // Check if we have any valid visible curves
        const visibleCurves = curves.filter(c => c.visible && c.data.length > 0);
        
        if (visibleCurves.length === 0) {
            dom.chartEmpty.style.display = 'block';
            dom.statsSummary.style.display = 'none';
            dom.exportCsvBtn.disabled = true;
            dom.exportJsonBtn.disabled = true;
            dom.exportPngBtn.disabled = true;
            
            if (chart) {
                chart.destroy();
                chart = null;
            }
            
            updateDataTable([], []);
            return;
        }
        
        dom.chartEmpty.style.display = 'none';
        dom.statsSummary.style.display = 'grid';
        dom.exportCsvBtn.disabled = false;
        dom.exportJsonBtn.disabled = false;
        dom.exportPngBtn.disabled = false;
        
        // Build datasets with transformed data based on view mode
        const datasets = visibleCurves.map(curve => ({
            label: curve.name,
            data: getDisplayData(curve.data),
            borderColor: curve.color,
            backgroundColor: hexToRgba(curve.color, 0.12),
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
            spanGaps: false, // Don't connect across null values
        }));
        
        // Create or update chart
        if (chart) {
            chart.data.labels = levels;
            chart.data.datasets = datasets;
            chart.update();
        } else {
            const ctx = dom.curveChart.getContext('2d');
            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: levels,
                    datasets: datasets,
                },
                plugins: [referenceLinePlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: '#a0a0a0',
                                font: { family: 'Inter', size: 11 },
                                usePointStyle: true,
                                pointStyle: 'circle',
                            },
                        },
                        tooltip: {
                            backgroundColor: 'rgba(20, 20, 20, 0.9)',
                            titleColor: '#ffffff',
                            bodyColor: '#a0a0a0',
                            borderColor: '#333',
                            borderWidth: 1,
                            titleFont: { family: 'Inter', size: 12, weight: '600' },
                            bodyFont: { family: 'JetBrains Mono', size: 11 },
                            padding: 10,
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    if (value === null) return `${context.dataset.label}: N/A`;
                                    if (viewMode === 'growth') {
                                        return `${context.dataset.label}: ${value.toFixed(4)}×`;
                                    }
                                    return `${context.dataset.label}: ${formatNumber(value)}`;
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Level',
                                color: '#666',
                                font: { family: 'Inter', size: 11 },
                            },
                            ticks: { color: '#666', font: { family: 'JetBrains Mono', size: 10 } },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                        y: {
                            type: logScale ? 'logarithmic' : 'linear',
                            title: {
                                display: true,
                                text: getYAxisLabel(),
                                color: '#666',
                                font: { family: 'Inter', size: 11 },
                            },
                            ticks: { 
                                color: '#666', 
                                font: { family: 'JetBrains Mono', size: 10 },
                                callback: function(value) {
                                    if (viewMode === 'growth') {
                                        return value.toFixed(2) + '×';
                                    }
                                    return formatNumber(value);
                                },
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                    },
                },
            });
        }
        
        // Update stats curve selector
        updateStatsCurveSelect(visibleCurves);
        
        // Find the curve to show stats for
        let statsCurve = visibleCurves.find(c => c.id === statsCurveId);
        if (!statsCurve) {
            statsCurve = visibleCurves[0];
            statsCurveId = statsCurve.id;
        }
        
        // Calculate stats based on view mode
        if (viewMode === 'growth') {
            // Growth mode: show min/max multipliers
            const growthData = getDisplayData(statsCurve.data).filter(v => v !== null && isFinite(v));
            const minMult = growthData.length > 0 ? Math.min(...growthData) : 0;
            const maxMult = growthData.length > 0 ? Math.max(...growthData) : 0;
            
            dom.statMinValue.textContent = minMult > 0 ? minMult.toFixed(4) + '×' : 'N/A';
            dom.statMaxValue.textContent = maxMult > 0 ? maxMult.toFixed(4) + '×' : 'N/A';
            dom.statGrowthFactor.textContent = '-';
            
            // Update labels for growth mode
            dom.statMinValue.nextElementSibling.textContent = 'Min Multiplier';
            dom.statMaxValue.nextElementSibling.textContent = 'Max Multiplier';
            dom.statGrowthFactor.nextElementSibling.textContent = '-';
        } else {
            // Absolute mode: show min/max values and total growth
            const minValue = Math.min(...statsCurve.data);
            const maxValue = Math.max(...statsCurve.data);
            const startValue = statsCurve.data[0];
            const growthFactor = startValue !== 0 && isFinite(maxValue / startValue) 
                ? maxValue / startValue 
                : 0;
            
            dom.statMinValue.textContent = formatNumber(minValue);
            dom.statMaxValue.textContent = formatNumber(maxValue);
            dom.statGrowthFactor.textContent = growthFactor > 0 ? formatNumber(growthFactor, 1) + 'x' : 'N/A';
            
            // Restore labels for absolute mode
            dom.statMinValue.nextElementSibling.textContent = 'Min Value';
            dom.statMaxValue.nextElementSibling.textContent = 'Max Value';
            dom.statGrowthFactor.nextElementSibling.textContent = 'Max / Start';
        }
        
        // Update data table
        updateDataTable(levels, visibleCurves);
    }

    /**
     * Updates the data table.
     * @param {Array} levels - Array of level values
     * @param {Array} curves - Array of visible curves
     */
    function updateDataTable(levels, visibleCurves) {
        // Update header
        let headerHtml = '<th>Level</th>';
        visibleCurves.forEach(curve => {
            headerHtml += `<th style="color: ${curve.color}">${escapeHtml(curve.name)}</th>`;
        });
        dom.tableHeader.innerHTML = headerHtml;
        
        // Update body (sample every N rows if too many)
        const sampleInterval = levels.length > 50 ? Math.ceil(levels.length / 50) : 1;
        let bodyHtml = '';
        
        for (let i = 0; i < levels.length; i += sampleInterval) {
            bodyHtml += `<tr><td>${levels[i]}</td>`;
            visibleCurves.forEach(curve => {
                bodyHtml += `<td>${formatNumber(curve.data[i])}</td>`;
            });
            bodyHtml += '</tr>';
        }
        
        // Always include last row
        if ((levels.length - 1) % sampleInterval !== 0 && levels.length > 0) {
            const lastIdx = levels.length - 1;
            bodyHtml += `<tr><td>${levels[lastIdx]}</td>`;
            visibleCurves.forEach(curve => {
                bodyHtml += `<td>${formatNumber(curve.data[lastIdx])}</td>`;
            });
            bodyHtml += '</tr>';
        }
        
        dom.tableBody.innerHTML = bodyHtml;
    }

    // ==========================================================================
    // Export Functions
    // ==========================================================================

    /**
     * Exports data as CSV.
     */
    function exportCsv() {
        const visibleCurves = curves.filter(c => c.visible && c.data.length > 0);
        
        if (visibleCurves.length === 0) {
            showToast('No data to export', true);
            return;
        }
        
        // Use actual data length (already clamped during updateChart)
        const minLevel = parseInt(dom.minLevel.value) || 1;
        const dataLength = visibleCurves[0].data.length;
        
        // Build CSV
        let csv = 'Level,' + visibleCurves.map(c => `"${c.name}"`).join(',') + '\n';
        
        for (let i = 0; i < dataLength; i++) {
            const level = minLevel + i;
            csv += level + ',' + visibleCurves.map(c => c.data[i]).join(',') + '\n';
        }
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'progression-curves.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        showToast(`CSV exported (${dataLength} rows)`);
    }

    /**
     * Exports data as JSON.
     */
    function exportJson() {
        const base = parseFloat(dom.baseValue.value) || 10;
        const minLevel = parseInt(dom.minLevel.value) || 1;
        const visibleCurves = curves.filter(c => c.visible && c.data.length > 0);
        
        if (visibleCurves.length === 0) {
            showToast('No data to export', true);
            return;
        }
        
        // Use actual data length (already clamped)
        const dataLength = visibleCurves[0].data.length;
        const actualMaxLevel = minLevel + dataLength - 1;
        
        const exportData = {
            settings: {
                baseValue: base,
                minLevel: minLevel,
                maxLevel: actualMaxLevel,
            },
            curves: visibleCurves.map(c => ({
                name: c.name,
                formula: c.formula,
                color: c.color,
                values: c.data,
            })),
        };
        
        // Download
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'progression-curves.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        showToast('JSON exported');
    }

    /**
     * Exports chart as PNG.
     */
    function exportPng() {
        if (!chart) {
            showToast('No chart to export', true);
            return;
        }
        
        const link = document.createElement('a');
        link.href = chart.toBase64Image();
        link.download = 'progression-curves.png';
        link.click();
        
        showToast('PNG exported');
    }

    // ==========================================================================
    // Event Handlers
    // ==========================================================================

    /**
     * Handles preset selection.
     */
    function handlePresetSelect() {
        const preset = PRESETS[dom.presetSelect.value];
        if (preset) {
            addCurve(preset.name, preset.formula);
            dom.presetSelect.value = '';
        }
    }

    /**
     * Handles add custom curve button.
     */
    function handleAddCurve() {
        addCurve(`Curve ${nextCurveId}`, 'base * level');
    }

    /**
     * Handles reset button.
     */
    function handleReset() {
        curves = [];
        nextCurveId = 1;
        dom.baseValue.value = 10;
        dom.minLevel.value = 1;
        dom.maxLevel.value = 100;
        renderCurveList();
        updateChart();
        updateAddButton();
        showToast('Reset complete');
    }

    /**
     * Handles table toggle.
     */
    function handleTableToggle() {
        const isShown = dom.tableContainer.classList.toggle('show');
        dom.tableToggle.textContent = isShown ? 'Hide ▲' : 'Show ▼';
    }

    /**
     * Handles log scale toggle.
     */
    function handleLogScaleToggle() {
        const wantsLog = dom.logScaleToggle.checked;
        
        // Don't allow log scale in growth mode
        if (wantsLog && viewMode === 'growth') {
            showToast('Log scale not available in Growth mode', true);
            dom.logScaleToggle.checked = false;
            return;
        }
        
        // Check for zero/negative values if enabling log scale
        if (wantsLog) {
            const visibleCurves = curves.filter(c => c.visible && c.data.length > 0);
            const hasInvalidValues = visibleCurves.some(c => c.data.some(v => v <= 0));
            
            if (hasInvalidValues) {
                showToast('Log scale requires all values > 0', true);
                dom.logScaleToggle.checked = false;
                return;
            }
        }
        
        logScale = wantsLog;
        
        // Need to recreate chart for scale type change
        if (chart) {
            chart.destroy();
            chart = null;
        }
        updateChart();
    }

    /**
     * Handles stats curve selection change.
     */
    function handleStatsCurveChange() {
        statsCurveId = parseInt(dom.statsCurveSelect.value);
        updateChart();
    }

    /**
     * Handles view mode change.
     */
    function handleViewModeChange() {
        viewMode = dom.viewModeSelect.value;
        
        // Auto-disable log scale in growth mode (log of ratios is cognitively cursed)
        if (viewMode === 'growth' && logScale) {
            logScale = false;
            dom.logScaleToggle.checked = false;
            showToast('Log scale disabled in Growth mode');
        }
        
        // Update reference line section visibility
        updateRefLineSectionVisibility();
        
        // Need to recreate chart for proper axis update
        if (chart) {
            chart.destroy();
            chart = null;
        }
        updateChart();
    }

    /**
     * Handles adding a reference line from input.
     */
    function handleAddRefLine() {
        const value = parseFloat(dom.refLineInput.value);
        addRefLine(value);
        dom.refLineInput.value = '';
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    function init() {
        // Event listeners
        dom.presetSelect.addEventListener('change', handlePresetSelect);
        dom.addCurveBtn.addEventListener('click', handleAddCurve);
        dom.resetBtn.addEventListener('click', handleReset);
        dom.tableToggle.addEventListener('click', handleTableToggle);
        dom.exportCsvBtn.addEventListener('click', exportCsv);
        dom.exportJsonBtn.addEventListener('click', exportJson);
        dom.exportPngBtn.addEventListener('click', exportPng);
        
        // Log scale toggle
        if (dom.logScaleToggle) {
            dom.logScaleToggle.addEventListener('change', handleLogScaleToggle);
        }
        
        // Stats curve selector
        if (dom.statsCurveSelect) {
            dom.statsCurveSelect.addEventListener('change', handleStatsCurveChange);
        }
        
        // View mode selector
        if (dom.viewModeSelect) {
            dom.viewModeSelect.addEventListener('change', handleViewModeChange);
        }
        
        // Reference line controls
        if (dom.refLineAddBtn) {
            dom.refLineAddBtn.addEventListener('click', handleAddRefLine);
        }
        if (dom.refLineInput) {
            dom.refLineInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleAddRefLine();
            });
        }
        
        // Live update on settings change
        [dom.baseValue, dom.minLevel, dom.maxLevel].forEach(input => {
            input.addEventListener('input', updateChart);
        });
        
        // Add a default curve to start
        addCurve('Exponential', 'base * 1.1 ** level');
        
        // Initialize reference lines UI
        renderRefLineList();
        updateRefLineSectionVisibility();
        
        // Initial render
        renderCurveList();
        updateChart();
    }

    // Start
    init();

})();
