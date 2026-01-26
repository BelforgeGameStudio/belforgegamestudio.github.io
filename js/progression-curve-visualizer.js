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

    const PRESETS = {
        'linear': { name: 'Linear', formula: 'base * level' },
        'exponential': { name: 'Exponential', formula: 'base * 1.1 ** level' },
        'polynomial': { name: 'Polynomial', formula: 'base * level ** 2' },
        'logarithmic': { name: 'Logarithmic', formula: 'base * log2(level + 1)' },
        'xp-curve': { name: 'XP Curve', formula: 'base * level ** 1.5' },
        'cost-scaling': { name: 'Cost Scaling', formula: 'base * 1.15 ** level' },
        'diminishing': { name: 'Diminishing Returns', formula: 'base * (1 - 0.99 ** level)' },
        'soft-cap': { name: 'Soft Cap', formula: 'base * level / (level + 50) * 100' },
        'sigmoid': { name: 'Sigmoid', formula: 'base * 100 / (1 + 99 * 0.9 ** level)' },
        'smoothstep': { name: 'Smoothstep', formula: 'base * (3 * (level/100)**2 - 2 * (level/100)**3) * 100' },
    };

    // ==========================================================================
    // State
    // ==========================================================================

    let curves = [];
    let nextCurveId = 1;
    let chart = null;

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
    // Safe Math Parser (reused from offline-progress-simulator)
    // ==========================================================================

    /**
     * Tokenizes a mathematical expression into tokens.
     * @param {string} expr - The expression to tokenize
     * @returns {Array} Array of tokens
     */
    function tokenize(expr) {
        const tokens = [];
        let i = 0;
        
        while (i < expr.length) {
            const char = expr[i];
            
            // Skip whitespace
            if (/\s/.test(char)) {
                i++;
                continue;
            }
            
            // Numbers (including decimals)
            if (/[0-9.]/.test(char)) {
                let num = '';
                while (i < expr.length && /[0-9.]/.test(expr[i])) {
                    num += expr[i++];
                }
                tokens.push({ type: 'number', value: parseFloat(num) });
                continue;
            }
            
            // Identifiers (variables and functions)
            if (/[a-zA-Z_]/.test(char)) {
                let id = '';
                while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
                    id += expr[i++];
                }
                tokens.push({ type: 'identifier', value: id });
                continue;
            }
            
            // Two-character operators
            if (expr.substring(i, i + 2) === '**') {
                tokens.push({ type: 'operator', value: '**' });
                i += 2;
                continue;
            }
            
            // Single-character operators and parentheses
            if ('+-*/(),%'.includes(char)) {
                tokens.push({ type: 'operator', value: char });
                i++;
                continue;
            }
            
            // Caret operator (common mistake)
            if (char === '^') {
                throw new Error('Use ** or pow(a, b) for exponents, not ^');
            }
            
            throw new Error(`Unexpected character: ${char}`);
        }
        
        return tokens;
    }

    /**
     * Parses and evaluates a mathematical expression safely.
     * Uses recursive descent parsing with proper operator precedence.
     * 
     * @param {string} expr - The expression to evaluate
     * @param {object} variables - Object containing variable values
     * @returns {number} The result of the expression
     */
    function safeEval(expr, variables) {
        const tokens = tokenize(expr);
        let pos = 0;
        
        // Whitelisted functions
        const functions = {
            'abs': Math.abs,
            'ceil': Math.ceil,
            'floor': Math.floor,
            'round': Math.round,
            'sqrt': Math.sqrt,
            'cbrt': Math.cbrt,
            'log': Math.log,
            'log2': Math.log2,
            'log10': Math.log10,
            'exp': Math.exp,
            'sin': Math.sin,
            'cos': Math.cos,
            'tan': Math.tan,
            'asin': Math.asin,
            'acos': Math.acos,
            'atan': Math.atan,
            'sinh': Math.sinh,
            'cosh': Math.cosh,
            'tanh': Math.tanh,
            'sign': Math.sign,
            'trunc': Math.trunc,
            'pow': Math.pow,
            'min': Math.min,
            'max': Math.max,
            'clamp': (val, min, max) => Math.min(Math.max(val, min), max),
            'lerp': (a, b, t) => a + (b - a) * t,
        };
        
        // Whitelisted constants
        const constants = {
            'PI': Math.PI,
            'E': Math.E,
            'LN2': Math.LN2,
            'LN10': Math.LN10,
            'LOG2E': Math.LOG2E,
            'LOG10E': Math.LOG10E,
            'SQRT2': Math.SQRT2,
            'SQRT1_2': Math.SQRT1_2,
        };
        
        function peek() {
            return tokens[pos];
        }
        
        function consume() {
            return tokens[pos++];
        }
        
        function parseExpression() {
            return parseAdditive();
        }
        
        function parseAdditive() {
            let left = parseMultiplicative();
            
            while (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
                const op = consume().value;
                const right = parseMultiplicative();
                left = op === '+' ? left + right : left - right;
            }
            
            return left;
        }
        
        function parseMultiplicative() {
            let left = parsePower();
            
            while (peek() && peek().type === 'operator' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
                const op = consume().value;
                const right = parsePower();
                if (op === '*') left = left * right;
                else if (op === '/') left = left / right;
                else left = left % right;
            }
            
            return left;
        }
        
        function parsePower() {
            let left = parseUnary();
            
            if (peek() && peek().type === 'operator' && peek().value === '**') {
                consume();
                const right = parsePower(); // Right associative
                left = Math.pow(left, right);
            }
            
            return left;
        }
        
        function parseUnary() {
            if (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
                const op = consume().value;
                const operand = parseUnary();
                return op === '-' ? -operand : operand;
            }
            return parsePrimary();
        }
        
        function parsePrimary() {
            const token = peek();
            
            if (!token) {
                throw new Error('Unexpected end of expression');
            }
            
            // Numbers
            if (token.type === 'number') {
                consume();
                return token.value;
            }
            
            // Parentheses
            if (token.type === 'operator' && token.value === '(') {
                consume();
                const result = parseExpression();
                if (!peek() || peek().value !== ')') {
                    throw new Error('Missing closing parenthesis');
                }
                consume();
                return result;
            }
            
            // Identifiers (variables, constants, functions)
            if (token.type === 'identifier') {
                consume();
                const name = token.value;
                
                // Check for function call
                if (peek() && peek().type === 'operator' && peek().value === '(') {
                    consume();
                    
                    // Handle Math.xxx prefix
                    let funcName = name;
                    if (name === 'Math' && peek() && peek().type === 'operator' && peek().value === '.') {
                        // This is a simplification - we'll just skip "Math." prefix
                        throw new Error('Use function names directly (e.g., "pow" not "Math.pow")');
                    }
                    
                    const func = functions[funcName];
                    if (!func) {
                        throw new Error(`Unknown function: ${funcName}`);
                    }
                    
                    // Parse arguments
                    const args = [];
                    if (peek() && peek().value !== ')') {
                        args.push(parseExpression());
                        while (peek() && peek().value === ',') {
                            consume();
                            args.push(parseExpression());
                        }
                    }
                    
                    if (!peek() || peek().value !== ')') {
                        throw new Error('Missing closing parenthesis in function call');
                    }
                    consume();
                    
                    return func(...args);
                }
                
                // Check for constant
                if (constants.hasOwnProperty(name)) {
                    return constants[name];
                }
                
                // Check for variable
                if (variables.hasOwnProperty(name)) {
                    return variables[name];
                }
                
                throw new Error(`Unknown variable: ${name}`);
            }
            
            throw new Error(`Unexpected token: ${token.value}`);
        }
        
        const result = parseExpression();
        
        if (pos < tokens.length) {
            throw new Error(`Unexpected token: ${tokens[pos].value}`);
        }
        
        return result;
    }

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
                        <button class="curve-action-btn visibility ${curve.visible ? '' : 'hidden'}" data-action="visibility" title="Toggle visibility">
                            ${curve.visible ? '👁' : '👁‍🗨'}
                        </button>
                        <button class="curve-action-btn delete" data-action="delete" title="Remove curve">🗑</button>
                    </div>
                </div>
                <textarea class="curve-formula ${curve.error ? 'error' : ''}" data-action="formula" rows="1">${escapeHtml(curve.formula)}</textarea>
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
                updateCurve(id, 'formula', e.target.value);
            });
            
            item.querySelector('[data-action="visibility"]').addEventListener('click', () => {
                updateCurve(id, 'visible', !curves.find(c => c.id === id).visible);
                renderCurveList();
            });
            
            item.querySelector('[data-action="delete"]').addEventListener('click', () => {
                removeCurve(id);
            });
        });
    }

    /**
     * Escapes HTML special characters.
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================================================
    // Chart Management
    // ==========================================================================

    /**
     * Converts a hex color to rgba with specified alpha.
     * Safely handles various color formats.
     * @param {string} color - Hex color (e.g., '#e85d04')
     * @param {number} alpha - Alpha value 0-1
     * @returns {string} RGBA color string
     */
    function hexToRgba(color, alpha) {
        // Default fallback
        if (!color || typeof color !== 'string') {
            return `rgba(128, 128, 128, ${alpha})`;
        }
        
        // Handle hex colors
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            let r, g, b;
            
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length === 6) {
                r = parseInt(hex.slice(0, 2), 16);
                g = parseInt(hex.slice(2, 4), 16);
                b = parseInt(hex.slice(4, 6), 16);
            } else {
                return `rgba(128, 128, 128, ${alpha})`;
            }
            
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        
        // Already rgb/rgba - just return with new alpha
        if (color.startsWith('rgb')) {
            const match = color.match(/[\d.]+/g);
            if (match && match.length >= 3) {
                return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
            }
        }
        
        return `rgba(128, 128, 128, ${alpha})`;
    }

    /**
     * Updates the chart with current curve data.
     */
    function updateChart() {
        const base = parseFloat(dom.baseValue.value) || 10;
        const minLevel = parseInt(dom.minLevel.value) || 1;
        const maxLevel = parseInt(dom.maxLevel.value) || 100;
        
        if (minLevel >= maxLevel) {
            showToast('Min level must be less than max level', true);
            return;
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
        
        // Re-render curve list to show errors
        renderCurveList();
        
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
        
        // Build datasets
        const datasets = visibleCurves.map(curve => ({
            label: curve.name,
            data: curve.data,
            borderColor: curve.color,
            backgroundColor: hexToRgba(curve.color, 0.12),
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 4,
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
                                    return `${context.dataset.label}: ${formatNumber(context.parsed.y)}`;
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
                            title: {
                                display: true,
                                text: 'Value',
                                color: '#666',
                                font: { family: 'Inter', size: 11 },
                            },
                            ticks: { 
                                color: '#666', 
                                font: { family: 'JetBrains Mono', size: 10 },
                                callback: function(value) {
                                    return formatNumber(value);
                                },
                            },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                        },
                    },
                },
            });
        }
        
        // Update stats (using first visible curve)
        const primaryCurve = visibleCurves[0];
        const minValue = Math.min(...primaryCurve.data);
        const maxValue = Math.max(...primaryCurve.data);
        const growthFactor = primaryCurve.data[0] !== 0 ? maxValue / primaryCurve.data[0] : 0;
        
        dom.statMinValue.textContent = formatNumber(minValue);
        dom.statMaxValue.textContent = formatNumber(maxValue);
        dom.statGrowthFactor.textContent = formatNumber(growthFactor, 1) + 'x';
        
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
        const base = parseFloat(dom.baseValue.value) || 10;
        const minLevel = parseInt(dom.minLevel.value) || 1;
        const maxLevel = parseInt(dom.maxLevel.value) || 100;
        const visibleCurves = curves.filter(c => c.visible && c.data.length > 0);
        
        if (visibleCurves.length === 0) {
            showToast('No data to export', true);
            return;
        }
        
        // Build CSV
        let csv = 'Level,' + visibleCurves.map(c => `"${c.name}"`).join(',') + '\n';
        
        for (let i = minLevel; i <= maxLevel; i++) {
            const idx = i - minLevel;
            csv += i + ',' + visibleCurves.map(c => c.data[idx]).join(',') + '\n';
        }
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'progression-curves.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        showToast('CSV exported');
    }

    /**
     * Exports data as JSON.
     */
    function exportJson() {
        const base = parseFloat(dom.baseValue.value) || 10;
        const minLevel = parseInt(dom.minLevel.value) || 1;
        const maxLevel = parseInt(dom.maxLevel.value) || 100;
        const visibleCurves = curves.filter(c => c.visible && c.data.length > 0);
        
        if (visibleCurves.length === 0) {
            showToast('No data to export', true);
            return;
        }
        
        const exportData = {
            settings: {
                baseValue: base,
                minLevel: minLevel,
                maxLevel: maxLevel,
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
        
        // Live update on settings change
        [dom.baseValue, dom.minLevel, dom.maxLevel].forEach(input => {
            input.addEventListener('input', updateChart);
        });
        
        // Add a default curve to start
        addCurve('Exponential', 'base * 1.1 ** level');
        
        // Initial render
        renderCurveList();
        updateChart();
    }

    // Start
    init();

})();
