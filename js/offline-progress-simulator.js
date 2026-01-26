/**
 * Offline Progress Simulator
 * A tool for idle/incremental game developers to simulate and balance offline progression.
 * 
 * @author Belforge Game Studio
 * @version 1.0.0
 */

(function() {
    'use strict';

    // ==========================================================================
    // State Management
    // ==========================================================================

    const state = {
        simulationData: null,
        chart: null,
        selectedHours: 8
    };

    // ==========================================================================
    // DOM References
    // ==========================================================================

    const dom = {
        // Inputs
        formula: document.getElementById('formula'),
        baseRate: document.getElementById('baseRate'),
        level: document.getElementById('level'),
        offlineCap: document.getElementById('offlineCap'),
        tickInterval: document.getElementById('tickInterval'),
        customHours: document.getElementById('customHours'),
        customMinutes: document.getElementById('customMinutes'),
        showTickLog: document.getElementById('showTickLog'),

        // Buttons
        simulateBtn: document.getElementById('simulateBtn'),
        resetBtn: document.getElementById('resetBtn'),
        exportCsv: document.getElementById('exportCsv'),
        copyResults: document.getElementById('copyResults'),
        showExamples: document.getElementById('showExamples'),

        // Time presets
        timePresets: document.querySelectorAll('.time-preset-btn'),

        // Results
        totalEarned: document.getElementById('totalEarned'),
        productionRate: document.getElementById('productionRate'),
        avgRate: document.getElementById('avgRate'),
        capCard: document.getElementById('capCard'),
        capReachedAt: document.getElementById('capReachedAt'),
        efficiencyCard: document.getElementById('efficiencyCard'),
        capEfficiency: document.getElementById('capEfficiency'),
        capIndicator: document.getElementById('capIndicator'),
        capTime: document.getElementById('capTime'),

        // Chart
        chartCanvas: document.getElementById('progressChart'),
        chartEmpty: document.getElementById('chartEmpty'),

        // Tick log
        tickLogSection: document.getElementById('tickLogSection'),
        tickLog: document.getElementById('tickLog'),
        tickCount: document.getElementById('tickCount'),

        // Formula dropdown
        formulaDropdown: document.getElementById('formulaDropdown'),
        formulaError: document.getElementById('formulaError'),

        // Toast
        toast: document.getElementById('toast')
    };

    // ==========================================================================
    // Calculation Engine
    // ==========================================================================

    /**
     * Safely evaluates a production formula with given variables.
     * Uses the global safeEval from utils.js.
     * 
     * @param {string} formula - The formula string to evaluate
     * @param {object} vars - Variables available to the formula (base, level, time)
     * @returns {number} The calculated production value
     */
    function evaluateFormula(formula, vars) {
        try {
            const result = safeEval(formula, vars);
            return Math.max(0, result); // Ensure non-negative
        } catch (error) {
            throw new Error(`Formula error: ${error.message}`);
        }
    }

    /**
     * Main simulation function.
     * Calculates resource accumulation over time based on production formula.
     * 
     * @param {object} config - Simulation configuration
     * @param {string} config.formula - Production formula
     * @param {number} config.baseRate - Base production per second
     * @param {number} config.level - Current level
     * @param {number} config.offlineCapHours - Max hours to accumulate (0 = no cap)
     * @param {number} config.durationSeconds - Total simulation duration in seconds
     * @param {number} config.tickInterval - How often to calculate (in seconds)
     * @returns {object} Simulation results
     */
    function runSimulation(config) {
        const {
            formula,
            baseRate,
            level,
            offlineCapHours,
            durationSeconds,
            tickInterval
        } = config;

        // Calculate effective duration (respecting cap)
        const capSeconds = offlineCapHours > 0 ? offlineCapHours * 3600 : Infinity;
        const effectiveDuration = Math.min(durationSeconds, capSeconds);
        const isCapped = durationSeconds > capSeconds && capSeconds < Infinity;

        // Determine tick count and interval for performance
        // For long durations, we'll sample fewer points for the chart
        const maxTicks = 10000; // Prevent memory issues
        const actualTickInterval = Math.max(
            tickInterval,
            effectiveDuration / maxTicks
        );
        const totalTicks = Math.ceil(effectiveDuration / actualTickInterval);

        const ticks = [];
        const chartPoints = [];
        let totalAccumulated = 0;
        let currentProductionRate = 0;

        // Sample points for chart (max 500 for smooth rendering)
        const chartSampleInterval = Math.max(1, Math.floor(totalTicks / 500));

        let previousTime = 0;
        
        for (let i = 0; i <= totalTicks; i++) {
            const timeSeconds = Math.min(i * actualTickInterval, effectiveDuration);
            
            // Calculate production at this moment
            const vars = {
                base: baseRate,
                level: level,
                time: timeSeconds
            };

            currentProductionRate = evaluateFormula(formula, vars);
            
            // Accumulate resources for this tick
            // Use actual elapsed time since last tick (fixes partial interval on final tick)
            if (i > 0) {
                const actualElapsed = timeSeconds - previousTime;
                const tickProduction = currentProductionRate * actualElapsed;
                totalAccumulated += tickProduction;
            }
            
            previousTime = timeSeconds;

            // Record tick data
            ticks.push({
                time: timeSeconds,
                production: currentProductionRate,
                accumulated: totalAccumulated,
                isCapped: isCapped && timeSeconds >= capSeconds
            });

            // Sample for chart
            if (i % chartSampleInterval === 0 || i === totalTicks) {
                chartPoints.push({
                    time: timeSeconds,
                    accumulated: totalAccumulated
                });
            }
        }

        return {
            totalAccumulated,
            productionRate: currentProductionRate,
            avgRate: effectiveDuration > 0 ? totalAccumulated / effectiveDuration : 0,
            durationSeconds: effectiveDuration,
            requestedDuration: durationSeconds,
            isCapped,
            capSeconds,
            ticks,
            chartPoints,
            tickInterval: actualTickInterval,
            tickCount: totalTicks
        };
    }

    // ==========================================================================
    // UI Updates (uses BelforgeUtils for formatNumber, formatTime, showToast)
    // ==========================================================================

    /**
     * Updates the results display with simulation data.
     * @param {object} data - Simulation results
     */
    function updateResults(data) {
        // Update summary cards
        dom.totalEarned.textContent = formatNumber(data.totalAccumulated);
        dom.productionRate.textContent = formatNumber(data.productionRate);
        dom.avgRate.textContent = formatNumber(data.avgRate);

        // Handle cap indicator and efficiency
        if (data.isCapped) {
            dom.capCard.style.display = 'block';
            dom.capCard.classList.add('capped');
            dom.capReachedAt.textContent = formatTime(data.capSeconds);
            dom.capIndicator.classList.add('show');
            dom.capTime.textContent = formatTime(data.capSeconds);
            
            // Show cap efficiency - how much of requested time was actually used
            dom.efficiencyCard.style.display = 'block';
            dom.efficiencyCard.classList.add('capped');
            const efficiencyPercent = Math.round((data.durationSeconds / data.requestedDuration) * 100);
            dom.capEfficiency.textContent = `${efficiencyPercent}%`;
            dom.capEfficiency.title = `${formatTime(data.durationSeconds)} of ${formatTime(data.requestedDuration)} used`;
        } else {
            dom.capCard.style.display = 'none';
            dom.capCard.classList.remove('capped');
            dom.capIndicator.classList.remove('show');
            dom.efficiencyCard.style.display = 'none';
            dom.efficiencyCard.classList.remove('capped');
        }

        // Enable export buttons
        dom.exportCsv.disabled = false;
        dom.copyResults.disabled = false;
    }

    /**
     * Updates the chart with simulation data.
     * @param {object} data - Simulation results
     */
    function updateChart(data) {
        dom.chartEmpty.style.display = 'none';

        const labels = data.chartPoints.map(p => formatTime(p.time));
        const values = data.chartPoints.map(p => p.accumulated);

        // Destroy existing chart
        if (state.chart) {
            state.chart.destroy();
        }

        // Create gradient
        const ctx = dom.chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(232, 93, 4, 0.3)');
        gradient.addColorStop(1, 'rgba(232, 93, 4, 0.0)');

        // Create chart
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Resources Accumulated',
                    data: values,
                    borderColor: '#e85d04',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#e85d04',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#161619',
                        titleColor: '#f0f0f0',
                        bodyColor: '#e85d04',
                        borderColor: '#2a2a2e',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            title: function(tooltipItems) {
                                return `Time: ${tooltipItems[0].label}`;
                            },
                            label: function(context) {
                                return `Accumulated: ${formatNumber(context.raw)}`;
                            }
                        }
                    },
                    // Note: Cap line visualization handled via cap indicator UI element
                    // (Chart.js annotation plugin not loaded)
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(42, 42, 46, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#888',
                            font: {
                                family: "'JetBrains Mono', monospace",
                                size: 10
                            },
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(42, 42, 46, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#888',
                            font: {
                                family: "'JetBrains Mono', monospace",
                                size: 10
                            },
                            callback: function(value) {
                                return formatNumber(value, 0);
                            }
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Updates the tick log display.
     * @param {object} data - Simulation results
     */
    function updateTickLog(data) {
        if (!dom.showTickLog.checked) {
            dom.tickLogSection.classList.remove('show');
            return;
        }

        dom.tickLogSection.classList.add('show');
        dom.tickCount.textContent = `${data.ticks.length.toLocaleString()} samples`;

        // Limit displayed ticks for performance
        const maxDisplayTicks = 1000;
        const sampleInterval = Math.max(1, Math.floor(data.ticks.length / maxDisplayTicks));
        
        let html = '';
        let previousAccumulated = 0;
        
        for (let i = 0; i < data.ticks.length; i += sampleInterval) {
            const tick = data.ticks[i];
            const cappedClass = tick.isCapped ? ' capped' : '';
            // Show actual earned since last displayed sample
            const earnedSinceLastSample = tick.accumulated - previousAccumulated;
            html += `
                <div class="tick-log-entry${cappedClass}">
                    <span class="tick-time">${formatTime(tick.time)}</span>
                    <span class="tick-production">+${formatNumber(earnedSinceLastSample)}</span>
                    <span class="tick-total">${formatNumber(tick.accumulated)}</span>
                </div>
            `;
            previousAccumulated = tick.accumulated;
        }

        // Add final tick if not included
        const lastSampledIndex = Math.floor((data.ticks.length - 1) / sampleInterval) * sampleInterval;
        if (lastSampledIndex !== data.ticks.length - 1) {
            const tick = data.ticks[data.ticks.length - 1];
            const cappedClass = tick.isCapped ? ' capped' : '';
            const earnedSinceLastSample = tick.accumulated - previousAccumulated;
            html += `
                <div class="tick-log-entry${cappedClass}">
                    <span class="tick-time">${formatTime(tick.time)}</span>
                    <span class="tick-production">+${formatNumber(earnedSinceLastSample)}</span>
                    <span class="tick-total">${formatNumber(tick.accumulated)}</span>
                </div>
            `;
        }

        dom.tickLog.innerHTML = html;
    }

    // ==========================================================================
    // Event Handlers
    // ==========================================================================

    /**
     * Clears formula error state.
     */
    function clearFormulaError() {
        dom.formula.classList.remove('error');
        dom.formulaError.classList.remove('show');
        dom.formulaError.textContent = '';
    }

    /**
     * Shows formula error inline.
     * @param {string} message - Error message to display
     */
    function showFormulaError(message) {
        dom.formula.classList.add('error');
        dom.formulaError.classList.add('show');
        dom.formulaError.textContent = message;
    }

    /**
     * Runs the simulation with current input values.
     */
    function handleSimulate() {
        // Clear any previous formula error
        clearFormulaError();
        
        try {
            // Gather inputs
            const formula = dom.formula.value.trim();
            const baseRate = parseFloat(dom.baseRate.value) || 0;
            const level = parseInt(dom.level.value) || 1;
            const offlineCapHours = parseFloat(dom.offlineCap.value) || 0;
            const tickInterval = parseFloat(dom.tickInterval.value) || 1;
            
            // Calculate duration
            const hours = parseFloat(dom.customHours.value) || 0;
            const minutes = parseFloat(dom.customMinutes.value) || 0;
            const durationSeconds = (hours * 3600) + (minutes * 60);

            if (durationSeconds <= 0) {
                showToast('Please enter a duration greater than 0', true);
                return;
            }

            if (!formula) {
                showFormulaError('Please enter a production formula');
                return;
            }

            // Validate formula by running a test evaluation
            try {
                evaluateFormula(formula, { base: baseRate, level: level, time: 0 });
            } catch (error) {
                // Show formula-specific error inline
                const errorMsg = error.message.replace('Formula error: ', '');
                showFormulaError(errorMsg);
                return;
            }

            // Run simulation
            const startTime = performance.now();
            
            state.simulationData = runSimulation({
                formula,
                baseRate,
                level,
                offlineCapHours,
                durationSeconds,
                tickInterval
            });

            const elapsed = performance.now() - startTime;

            // Update UI
            updateResults(state.simulationData);
            updateChart(state.simulationData);
            updateTickLog(state.simulationData);

            showToast(`Simulation complete (${elapsed.toFixed(0)}ms)`);

        } catch (error) {
            showToast(error.message, true);
            console.error('Simulation error:', error);
        }
    }

    /**
     * Resets all inputs to default values.
     */
    function handleReset() {
        dom.formula.value = 'base * 1.05 ** level';
        dom.baseRate.value = '10';
        dom.level.value = '1';
        dom.offlineCap.value = '24';
        dom.tickInterval.value = '1';
        dom.customHours.value = '8';
        dom.customMinutes.value = '0';
        dom.showTickLog.checked = false;

        // Reset time preset selection
        dom.timePresets.forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-hours="8"]').classList.add('active');
        state.selectedHours = 8;

        // Clear formula error
        clearFormulaError();

        // Clear results
        dom.totalEarned.textContent = '0';
        dom.productionRate.textContent = '0';
        dom.avgRate.textContent = '0';
        dom.capCard.style.display = 'none';
        dom.efficiencyCard.style.display = 'none';
        dom.capIndicator.classList.remove('show');
        dom.tickLogSection.classList.remove('show');
        dom.exportCsv.disabled = true;
        dom.copyResults.disabled = true;

        // Clear chart
        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }
        dom.chartEmpty.style.display = 'block';

        state.simulationData = null;

        showToast('Reset to defaults');
    }

    /**
     * Handles time preset button clicks.
     * @param {Event} event - Click event
     */
    function handleTimePreset(event) {
        const btn = event.target;
        if (!btn.classList.contains('time-preset-btn')) return;

        const hours = parseFloat(btn.dataset.hours);
        
        // Update selection
        dom.timePresets.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update custom time inputs
        dom.customHours.value = Math.floor(hours);
        dom.customMinutes.value = Math.round((hours % 1) * 60);
        
        state.selectedHours = hours;
    }

    /**
     * Handles custom time input changes.
     */
    function handleCustomTimeChange() {
        // Deselect presets when custom time is manually changed
        const hours = parseFloat(dom.customHours.value) || 0;
        const minutes = parseFloat(dom.customMinutes.value) || 0;
        const totalHours = hours + (minutes / 60);

        // Check if it matches a preset
        let matchedPreset = false;
        dom.timePresets.forEach(btn => {
            const presetHours = parseFloat(btn.dataset.hours);
            if (Math.abs(totalHours - presetHours) < 0.01) {
                btn.classList.add('active');
                matchedPreset = true;
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * Exports simulation data as CSV.
     */
    function handleExportCsv() {
        if (!state.simulationData) return;

        const data = state.simulationData;
        let csv = 'Time (seconds),Time (formatted),Rate (/sec),Earned This Tick,Accumulated Total\n';

        let previousAccumulated = 0;
        for (const tick of data.ticks) {
            const earnedThisTick = tick.accumulated - previousAccumulated;
            csv += `${tick.time},${formatTime(tick.time)},${tick.production},${earnedThisTick},${tick.accumulated}\n`;
            previousAccumulated = tick.accumulated;
        }

        // Create and download file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `offline-simulation-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('CSV exported');
    }

    /**
     * Copies simulation results to clipboard.
     */
    function handleCopyResults() {
        if (!state.simulationData) return;

        const data = state.simulationData;
        const formula = dom.formula.value.trim();
        const baseRate = dom.baseRate.value;
        const level = dom.level.value;

        let text = `=== Offline Progress Simulation ===\n\n`;
        text += `Configuration:\n`;
        text += `  Formula: ${formula}\n`;
        text += `  Base Rate: ${baseRate}/sec\n`;
        text += `  Level: ${level}\n`;
        text += `  Duration: ${formatTime(data.requestedDuration)}\n`;
        
        if (data.isCapped) {
            text += `  Offline Cap: ${formatTime(data.capSeconds)} (REACHED)\n`;
        }
        
        text += `\nResults:\n`;
        text += `  Total Earned: ${formatNumber(data.totalAccumulated)}\n`;
        text += `  Final Rate: ${formatNumber(data.productionRate)}/sec\n`;
        text += `  Avg Rate: ${formatNumber(data.avgRate)}/sec\n`;
        
        if (data.isCapped) {
            const efficiencyPercent = Math.round((data.durationSeconds / data.requestedDuration) * 100);
            text += `\n⚠️ Offline cap reached at ${formatTime(data.capSeconds)}\n`;
            text += `  Time Efficiency: ${efficiencyPercent}% (${formatTime(data.durationSeconds)} of ${formatTime(data.requestedDuration)} used)`;
        }

        navigator.clipboard.writeText(text).then(() => {
            showToast('Results copied to clipboard');
        }).catch(err => {
            showToast('Failed to copy', true);
            console.error('Copy failed:', err);
        });
    }

    /**
     * Shows or hides the formula examples dropdown.
     */
    function handleToggleExamples() {
        dom.formulaDropdown.classList.toggle('show');
    }

    /**
     * Handles formula example selection.
     * @param {Event} event - Click event
     */
    function handleFormulaSelect(event) {
        const item = event.target.closest('.formula-dropdown-item');
        if (!item) return;

        const formula = item.dataset.formula;
        dom.formula.value = formula;
        dom.formulaDropdown.classList.remove('show');
        showToast('Formula loaded');
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    function init() {
        // Bind event listeners
        dom.simulateBtn.addEventListener('click', handleSimulate);
        dom.resetBtn.addEventListener('click', handleReset);
        dom.exportCsv.addEventListener('click', handleExportCsv);
        dom.copyResults.addEventListener('click', handleCopyResults);
        dom.showExamples.addEventListener('click', handleToggleExamples);
        dom.formulaDropdown.addEventListener('click', handleFormulaSelect);

        // Time presets
        document.querySelector('.time-presets').addEventListener('click', handleTimePreset);
        dom.customHours.addEventListener('input', handleCustomTimeChange);
        dom.customMinutes.addEventListener('input', handleCustomTimeChange);

        // Toggle tick log visibility
        dom.showTickLog.addEventListener('change', () => {
            if (state.simulationData) {
                updateTickLog(state.simulationData);
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.formula-group')) {
                dom.formulaDropdown.classList.remove('show');
            }
        });

        // Run initial simulation
        handleSimulate();
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
