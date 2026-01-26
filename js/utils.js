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
    // Color Utilities
    // ==========================================================================

    /**
     * Converts a hex color to rgba with specified alpha.
     * Safely handles various color formats.
     * 
     * @param {string} color - Hex color (e.g., '#e85d04') or rgb/rgba string
     * @param {number} alpha - Alpha value 0-1
     * @returns {string} RGBA color string
     * 
     * @example
     * hexToRgba('#e85d04', 0.5)  // "rgba(232, 93, 4, 0.5)"
     * hexToRgba('#f00', 0.8)     // "rgba(255, 0, 0, 0.8)"
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

    // ==========================================================================
    // Safe Math Parser
    // ==========================================================================

    /**
     * Safe math expression parser.
     * Uses a whitelist approach - only allows specific tokens and operations.
     * No arbitrary code execution possible.
     * 
     * @example
     * SafeMathParser.evaluate('base * 1.1 ** level', { base: 10, level: 5 })
     * SafeMathParser.evaluate('sqrt(x) + pow(y, 2)', { x: 16, y: 3 })
     */
    const SafeMathParser = {
        // Allowed Math functions
        allowedFunctions: new Set([
            'abs', 'ceil', 'floor', 'round', 'trunc',
            'sqrt', 'cbrt', 'pow', 'exp', 'expm1',
            'log', 'log2', 'log10', 'log1p',
            'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
            'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
            'min', 'max', 'hypot', 'sign', 'clamp', 'lerp'
        ]),

        // Allowed constants
        allowedConstants: {
            'PI': Math.PI,
            'E': Math.E,
            'LN2': Math.LN2,
            'LN10': Math.LN10,
            'LOG2E': Math.LOG2E,
            'LOG10E': Math.LOG10E,
            'SQRT2': Math.SQRT2,
            'SQRT1_2': Math.SQRT1_2
        },

        /**
         * Tokenize the expression into tokens.
         * @param {string} expr - Expression to tokenize
         * @returns {Array} Array of tokens
         */
        tokenize(expr) {
            const tokens = [];
            let i = 0;
            
            while (i < expr.length) {
                const char = expr[i];
                
                // Skip whitespace
                if (/\s/.test(char)) {
                    i++;
                    continue;
                }
                
                // Numbers (including decimals and scientific notation)
                if (/[0-9.]/.test(char)) {
                    let num = '';
                    let hasDecimal = false;
                    let hasExponent = false;
                    
                    while (i < expr.length) {
                        const c = expr[i];
                        
                        if (/[0-9]/.test(c)) {
                            num += c;
                            i++;
                        } else if (c === '.' && !hasDecimal && !hasExponent) {
                            // Only one decimal point, and not after exponent
                            hasDecimal = true;
                            num += c;
                            i++;
                        } else if ((c === 'e' || c === 'E') && !hasExponent && num.length > 0) {
                            // Exponent - must have digits before it
                            hasExponent = true;
                            num += c;
                            i++;
                            // Allow optional sign after exponent
                            if (i < expr.length && (expr[i] === '+' || expr[i] === '-')) {
                                num += expr[i];
                                i++;
                            }
                        } else {
                            break;
                        }
                    }
                    
                    // Validate the number
                    const parsed = parseFloat(num);
                    if (isNaN(parsed)) {
                        throw new Error(`Invalid number: ${num}`);
                    }
                    
                    // Check for malformed patterns like "1e" or "1." at end
                    if (/[eE][+-]?$/.test(num) || /\.$/.test(num)) {
                        throw new Error(`Invalid number: ${num}`);
                    }
                    
                    tokens.push({ type: 'number', value: parsed });
                    continue;
                }
                
                // Identifiers (variables, functions, Math.xxx)
                if (/[a-zA-Z_]/.test(char)) {
                    let ident = '';
                    while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
                        ident += expr[i++];
                    }
                    
                    // Check for Math.xxx pattern
                    if (ident === 'Math' && expr[i] === '.') {
                        i++; // skip the dot
                        let mathIdent = '';
                        while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
                            mathIdent += expr[i++];
                        }
                        ident = mathIdent; // Use just the function/constant name
                    }
                    
                    tokens.push({ type: 'identifier', value: ident });
                    continue;
                }
                
                // ** exponent operator (check BEFORE single *)
                if (char === '*' && expr[i + 1] === '*') {
                    tokens.push({ type: 'operator', value: '**' });
                    i += 2;
                    continue;
                }
                
                // Single-char operators
                if ('+-*/%(),.'.includes(char)) {
                    tokens.push({ type: 'operator', value: char });
                    i++;
                    continue;
                }
                
                // Catch dangerous XOR operator
                if (char === '^') {
                    throw new Error('Use ** or pow(a, b) for exponents, not ^');
                }
                
                throw new Error(`Unexpected character: ${char}`);
            }
            
            return tokens;
        },

        /**
         * Parse and evaluate an expression.
         * @param {string} expr - Expression to evaluate
         * @param {object} variables - Object containing variable values
         * @returns {number} Result of the expression
         */
        evaluate(expr, variables) {
            const self = this;
            const tokens = this.tokenize(expr);
            let pos = 0;

            const peek = () => tokens[pos];
            const consume = () => tokens[pos++];

            // Recursive descent parser
            const parseExpression = () => parseAddSub();

            const parseAddSub = () => {
                let left = parseMulDiv();
                while (peek() && (peek().value === '+' || peek().value === '-')) {
                    const op = consume().value;
                    const right = parseMulDiv();
                    left = op === '+' ? left + right : left - right;
                }
                return left;
            };

            const parseMulDiv = () => {
                let left = parsePower();
                while (peek() && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
                    const op = consume().value;
                    const right = parsePower();
                    if (op === '*') left = left * right;
                    else if (op === '/') left = left / right;
                    else left = left % right;
                }
                return left;
            };

            const parsePower = () => {
                let left = parseUnary();
                if (peek() && peek().value === '**') {
                    consume();
                    const right = parsePower(); // Right associative
                    left = Math.pow(left, right);
                }
                return left;
            };

            const parseUnary = () => {
                if (peek() && (peek().value === '+' || peek().value === '-')) {
                    const op = consume().value;
                    const operand = parseUnary();
                    return op === '-' ? -operand : operand;
                }
                return parsePrimary();
            };

            const parsePrimary = () => {
                const token = peek();
                
                if (!token) {
                    throw new Error('Unexpected end of expression');
                }

                // Number literal
                if (token.type === 'number') {
                    consume();
                    return token.value;
                }

                // Parenthesized expression
                if (token.value === '(') {
                    consume(); // (
                    const result = parseExpression();
                    if (!peek() || peek().value !== ')') {
                        throw new Error('Missing closing parenthesis');
                    }
                    consume(); // )
                    return result;
                }

                // Identifier (variable, function, or constant)
                if (token.type === 'identifier') {
                    consume();
                    const name = token.value;

                    // Check if it's a function call
                    if (peek() && peek().value === '(') {
                        consume(); // (
                        const args = [];
                        
                        if (peek() && peek().value !== ')') {
                            args.push(parseExpression());
                            while (peek() && peek().value === ',') {
                                consume(); // ,
                                args.push(parseExpression());
                            }
                        }
                        
                        if (!peek() || peek().value !== ')') {
                            throw new Error('Missing closing parenthesis for function call');
                        }
                        consume(); // )

                        // Validate and execute function
                        if (!self.allowedFunctions.has(name)) {
                            throw new Error(`Unknown or disallowed function: ${name}`);
                        }
                        
                        // Special case for clamp (not in Math)
                        if (name === 'clamp') {
                            if (args.length !== 3) {
                                throw new Error('clamp requires 3 arguments: clamp(value, min, max)');
                            }
                            return Math.min(Math.max(args[0], args[1]), args[2]);
                        }
                        
                        // Special case for lerp (not in Math)
                        if (name === 'lerp') {
                            if (args.length !== 3) {
                                throw new Error('lerp requires 3 arguments: lerp(a, b, t)');
                            }
                            return args[0] + (args[1] - args[0]) * args[2];
                        }
                        
                        return Math[name](...args);
                    }

                    // Variable
                    if (name in variables) {
                        return variables[name];
                    }

                    // Math constant
                    if (name in self.allowedConstants) {
                        return self.allowedConstants[name];
                    }

                    throw new Error(`Unknown variable or constant: ${name}`);
                }

                throw new Error(`Unexpected token: ${token.value}`);
            };

            const result = parseExpression();
            
            if (pos < tokens.length) {
                throw new Error(`Unexpected token: ${tokens[pos].value}`);
            }

            return result;
        }
    };

    /**
     * Safely evaluates a math expression with given variables.
     * Wrapper around SafeMathParser.evaluate with validation.
     * 
     * @param {string} expr - The expression to evaluate
     * @param {object} vars - Variables available to the expression
     * @returns {number} The calculated value
     * @throws {Error} If expression is invalid or returns non-finite value
     * 
     * @example
     * safeEval('base * 1.1 ** level', { base: 10, level: 5 })  // 16.105...
     */
    function safeEval(expr, vars) {
        const result = SafeMathParser.evaluate(expr, vars);
        
        if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
            throw new Error('Expression must return a valid number');
        }
        
        return result;
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
        
        // Colors
        hexToRgba,
        
        // Math Parser
        SafeMathParser,
        safeEval,
        
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
    // Expose the full module for console/debugging
    window.BelforgeUtils = window.BelforgeUtils || BelforgeUtils;
    
    // Individual functions for direct use
    window.$ = window.$ || BelforgeUtils.$;
    window.showToast = window.showToast || BelforgeUtils.showToast;
    window.formatNumber = window.formatNumber || BelforgeUtils.formatNumber;
    window.formatTime = window.formatTime || BelforgeUtils.formatTime;
    window.escapeHtml = window.escapeHtml || BelforgeUtils.escapeHtml;
    window.hexToRgba = window.hexToRgba || BelforgeUtils.hexToRgba;
    window.SafeMathParser = window.SafeMathParser || BelforgeUtils.SafeMathParser;
    window.safeEval = window.safeEval || BelforgeUtils.safeEval;
    window.debounce = window.debounce || BelforgeUtils.debounce;
    window.sanitizeFilename = window.sanitizeFilename || BelforgeUtils.sanitizeFilename;
    window.copyToClipboard = window.copyToClipboard || BelforgeUtils.copyToClipboard;
    window.downloadFile = window.downloadFile || BelforgeUtils.downloadFile;
}
