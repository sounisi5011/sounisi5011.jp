const { compareUnicode } = require('./template-functions');

/**
 * @param {Object} obj
 * @param {string|symbol} prop
 * @returns {boolean}
 */
function hasProp(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}
exports.hasProp = hasProp;

/**
 * @param {(string|symbol)[]} props
 * @returns {function(*, *): number}
 * @see https://github.com/segmentio/metalsmith-collections/blob/v0.9.0/lib/index.js#L73-L82
 */
function propSort(...props) {
  return (a, b) => {
    for (const prop of props) {
      if (!hasProp(a, prop) && !hasProp(b, prop)) continue;

      const aValue = a[prop];
      const bValue = b[prop];
      if (!aValue && !bValue) return 0;
      if (!aValue) return -1;
      if (!bValue) return 1;
      if (typeof aValue === 'string' && typeof bValue === 'string')
        return compareUnicode(aValue, bValue);
      if (bValue > aValue) return -1;
      if (aValue > bValue) return 1;
    }
    return 0;
  };
}
exports.propSort = propSort;
