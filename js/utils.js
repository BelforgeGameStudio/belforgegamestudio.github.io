/**
 * Belforge Tools - Shared Utilities
 * Common functions used across all Belforge browser-based tools.
 * 
 * @author Belforge Game Studio
 * @version 1.0.0
 */

const BelforgeUtils = (function() {
    'use strict';

    // ==========================================================================
    // DOM Utilities
    // ==========================================================================

    /**
     * Shorthand for document.getElementById
     * @param {string} id - Element ID
     * @returns {HTMLElement|null}
     */
    function $(id) {
        return document.getElementById(id);
    }

    /**
     * Escapes HTML special characters to prevent XSS.
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================================================
    // Number Formatting
    // ==========================================================================

    /**
     * Formats a number for display with appropriate suffixes (K, M, B, T, etc).
     * Handles values less than 1, negative numbers, and very large numbers.
     * 
     * @param {number} num - Number to format
     * @param {number} decimals - Decimal places (default: 2)
     * @returns {string} Formatted number string
     * 
     * @example
     * formatNumber(1234)      // "1.23K"
     * formatNumber(1234567)   // "1.23M"
     * formatNumber(0.5)       // "0.50"
     * formatNumber(1e15)      // "1.00Qa"
     */
    function formatNumber(num, decimals = 2) {
        if (num === 0) return '0';
        
        const absNum = Math.abs(num);
        
        // Handle values less than 1 (including decimals like 0.5)
        if (absNum < 1) {
            return num.toFixed(decimals);
        }
        
        const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
        const tier = Math.floor(Math.log10(absNum) / 3);
        
        if (tier === 0) {
            return num.toFixed(decimals);
        }
        
        if (tier >= suffixes.length) {
            return num.toExponential(2);
        }
        
        const scaled = num / Math.pow(10, tier * 3);
        return scaled.toFixed(decimals) + suffixes[tier];
    }

    /**
     * Formats a number with commas as thousands separators.
     * @param {number} num - Number to format
     * @returns {string} Formatted number string
     * 
     * @example
     * formatWithCommas(1234567) // "1,234,567"
     */
    function formatWithCommas(num) {
        return num.toLocaleString();
    }

    // ==========================================================================
    // Time Formatting
    // ==========================================================================

    /**
     * Formats seconds into a human-readable time string.
     * Automatically chooses the most appropriate unit.
     * 
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     * 
     * @example
     * formatTime(45)      // "45.0s"
     * formatTime(90)      // "1m 30s"
     * formatTime(3700)    // "1h 1m"
     * formatTime(90000)   // "1d 1h"
     */
    function formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        } else if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
        } else if (seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        } else {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        }
    }

    /**
     * Parses a time string back into seconds.
     * Supports formats like "1h 30m", "90s", "2d", etc.
     * 
     * @param {string} timeStr - Time string to parse
     * @returns {number} Time in seconds
     */
    function parseTime(timeStr) {
        let totalSeconds = 0;
        const dayMatch = timeStr.match(/(\d+)\s*d/i);
        const hourMatch = timeStr.match(/(\d+)\s*h/i);
        const minMatch = timeStr.match(/(\d+)\s*m/i);
        const secMatch = timeStr.match(/(\d+(?:\.\d+)?)\s*s/i);
        
        if (dayMatch) totalSeconds += parseInt(dayMatch[1]) * 86400;
        if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
        if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
        if (secMatch) totalSeconds += parseFloat(secMatch[1]);
        
        return totalSeconds;
    }

    // ==========================================================================
    // Toast Notifications
    // ==========================================================================

    let toastElement = null;
    let toastTimeout = null;

    /**
     * Shows a toast notification.
     * Requires a .toast element in the DOM with .show and .error CSS classes.
     * 
     * @param {string} message - Message to display
     * @param {boolean} isError - Whether this is an error message (default: false)
     * @param {number} duration - How long to show the toast in ms (default: 2500)
     * 
     * @example
     * showToast('Saved successfully');
     * showToast('Something went wrong', true);
     */
    function showToast(message, isError = false, duration = 2500) {
        // Lazily find toast element
        if (!toastElement) {
            toastElement = document.getElementById('toast') || document.querySelector('.toast');
        }
        
        if (!toastElement) {
            console.warn('Toast element not found');
            return;
        }
        
        // Clear any existing timeout
        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }
        
        toastElement.textContent = message;
        toastElement.classList.toggle('error', isError);
        toastElement.classList.add('show');
        
        toastTimeout = setTimeout(() => {
            toastElement.classList.remove('show');
        }, duration);
    }

    // ==========================================================================
    // File Utilities
    // ==========================================================================

    /**
     * Downloads data as a file.
     * @param {string|Blob} data - Data to download
     * @param {string} filename - Name for the downloaded file
     * @param {string} mimeType - MIME type (default: 'text/plain')
     */
    function downloadFile(data, filename, mimeType = 'text/plain') {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * Copies text to clipboard with fallback for older browsers.
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Whether the copy succeeded
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (e) {
                document.body.removeChild(textarea);
                return false;
            }
        }
    }

    // ==========================================================================
    // Sanitization
    // ==========================================================================

    /**
     * Sanitizes a string for use as a filename.
     * Removes unsafe characters and normalizes separators.
     * 
     * @param {string} name - Filename to sanitize
     * @param {string} fallback - Fallback if result is empty (default: 'file')
     * @returns {string} Sanitized filename
     */
    function sanitizeFilename(name, fallback = 'file') {
        const sanitized = name
            .replace(/[<>:"/\\|?*]/g, '')      // Remove Windows-unsafe chars
            .replace(/[\s\-\.]+/g, '_')        // Collapse spaces, dashes, dots to underscore
            .replace(/_+/g, '_')               // Collapse multiple underscores
            .replace(/^_|_$/g, '')             // Trim leading/trailing underscores
            .trim();
        
        return sanitized || fallback;
    }

    // ==========================================================================
    // Debounce / Throttle
    // ==========================================================================

    /**
     * Creates a debounced version of a function.
     * The function will only be called after it stops being invoked for `wait` ms.
     * 
     * @param {Function} func - Function to debounce
     * @param {number} wait - Milliseconds to wait
     * @returns {Function} Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Creates a throttled version of a function.
     * The function will be called at most once per `limit` ms.
     * 
     * @param {Function} func - Function to throttle
     * @param {number} limit - Minimum milliseconds between calls
     * @returns {Function} Throttled function
     */
    function throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    return {
        // DOM
        $,
        escapeHtml,
        
        // Numbers
        formatNumber,
        formatWithCommas,
        
        // Time
        formatTime,
        parseTime,
        
        // Toast
        showToast,
        
        // Files
        downloadFile,
        copyToClipboard,
        sanitizeFilename,
        
        // Timing
        debounce,
        throttle
    };

})();

// Also expose individual functions globally for convenience
// (allows either BelforgeUtils.showToast() or just showToast())
if (typeof window !== 'undefined') {
    window.$ = window.$ || BelforgeUtils.$;
    window.showToast = window.showToast || BelforgeUtils.showToast;
    window.formatNumber = window.formatNumber || BelforgeUtils.formatNumber;
    window.formatTime = window.formatTime || BelforgeUtils.formatTime;
    window.escapeHtml = window.escapeHtml || BelforgeUtils.escapeHtml;
}
