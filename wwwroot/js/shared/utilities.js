/**
* Helper: Currency Formatting
*/
function formatMoney(amount, showPlus = false) {
    const num = Number(amount) || 0;
    const absStr = Math.abs(num).toFixed(2);
    if (num < 0) return `-$${absStr}`;
    if (num > 0 && showPlus) return `+$${absStr}`;
    return `$${absStr}`;
}


/**
* XSS Escaping Helper
*/
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


/**
 * Escape a value before inserting it inside a single-quoted
 * inline JavaScript argument.
 */
function escapeJavaScriptString(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}