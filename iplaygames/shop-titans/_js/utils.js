/** @format */

// _js/utils.js

/**
 * Copy text to clipboard with sensible fallbacks.
 * @param {string} text
 * @param {Element|string|null} [fallbackTarget] element or selector
 * @returns {Promise<boolean>} resolves true on success-ish, false on failure
 */
async function copyTextSmart(text, fallbackTarget) {
  if (text === undefined || text === null) return false;

  // Modern Clipboard API
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch (e) {
    // fall through to fallbacks
  }

  // If they passed an element / selector, try selecting its contents
  if (fallbackTarget) {
    let el = fallbackTarget;
    if (typeof fallbackTarget === "string") {
      el = document.querySelector(fallbackTarget);
    }
    if (el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        document.execCommand("copy");
        selection.removeAllRanges();
        return true;
      } catch (e) {
        // continue to final fallback
      }
    }
  }

  // Last-resort: hidden textarea
  const temp = document.createElement("textarea");
  temp.value = String(text);
  temp.setAttribute("readonly", "");
  temp.style.position = "fixed";
  temp.style.top = "-9999px";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.focus();
  temp.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(temp);
  return ok;
}

/**
 * Download a string as a file.
 * @param {string} filename
 * @param {string} data
 * @param {string} [mimeType]
 */
function downloadTextFile(filename, data, mimeType) {
  const blob = new Blob([data || ""], {
    type: mimeType || "text/plain;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Tiny helper to show a transient status message.
 * @param {HTMLElement|null} el
 * @param {string} message
 * @param {number} [duration=1400]
 */
function flashStatus(el, message, duration = 1400) {
  if (!el) return;
  el.textContent = message || "";
  if (!duration) return;
  window.setTimeout(() => {
    if (el.textContent === message) {
      el.textContent = "";
    }
  }, duration);
}

/**
 * Wire a button to copy text from a source element (or function) and flash
 * a green "Copied!" confirmation. Auto-handles form elements (selects + reads
 * .value) vs. other elements (reads .textContent).
 *
 * @param {HTMLElement|null} button       the button that triggers the copy
 * @param {HTMLElement|Function|null} source  textarea/input, any element with
 *                                            textContent, or a function returning
 *                                            the string to copy
 */
function wireCopyButton(button, source) {
  if (!button || !source) return;

  button.addEventListener("click", async () => {
    const original = button.textContent;

    let text;
    if (typeof source === "function") {
      text = source() || "";
    } else if (typeof source.value === "string") {
      // textarea / input — focus + select for visual confirmation
      if (typeof source.focus === "function") source.focus();
      if (typeof source.select === "function") source.select();
      text = source.value;
    } else {
      text = source.textContent || "";
    }

    const ok = await copyTextSmart(text);
    button.textContent = ok ? "Copied!" : "Copy failed";
    if (ok) button.classList.add("bg-emerald-500");

    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("bg-emerald-500");
    }, 900);
  });
}
