/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttrValue(value) {
  return (
    value
      /* @see https://html.spec.whatwg.org/multipage/syntax.html#character-references */
      .replace(/&(?!(?:[a-z0-9]+;?|#(?:[0-9]+|x[0-9a-f]+);))/gi, '&amp;')
      .replace(/"/g, '&#34;')
  ); // "
}
exports.escapeAttrValue = escapeAttrValue;

/**
 * @param {string} value
 * @returns {string}
 */
function wrapAttrValue(value) {
  const hasQuot = value.includes(`"`);
  const hasApos = value.includes(`'`);
  if (!hasQuot) return `"${value}"`;
  if (!hasApos) return `'${value}'`;
  return `"${escapeAttrValue(value)}"`;
}
exports.wrapAttrValue = wrapAttrValue;

/**
 * @param {[string, string][]|Object.<string, string>} attrs
 * @returns {string}
 */
function attrs2htmlText(attrs) {
  return (Array.isArray(attrs) ? attrs : Object.entries(attrs))
    .map(
      ([name, value]) =>
        ` ${name}${value !== '' ? `=${wrapAttrValue(value)}` : ''}`,
    )
    .join('');
}
exports.attrs2htmlText = attrs2htmlText;
