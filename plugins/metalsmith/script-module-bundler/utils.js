const fs = require('fs');
const path = require('path');
const util = require('util');

const pluginKit = require('metalsmith-plugin-kit');
const Terser = require('terser');

exports.cmp = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

exports.toJsValue = value =>
  JSON.stringify(value).replace(
    /[\u2028\u2029]/g,
    char => `\\u${char.codePointAt(0).toString(16)}`,
  );

exports.readFileAsync = util.promisify(fs.readFile);

/**
 * @see https://stackoverflow.com/a/45242825/4907315
 */
exports.isSameOrSubPath = (parentPath, targetPath) => {
  const relative = path.relative(parentPath, targetPath);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
};

exports.minifyJS = (code, options) => {
  const result = Terser.minify(code, options);
  if (result.error) throw result.error;
  return result.code;
};

/**
 * @param {Object} metalsmith
 * @param {string} filepath
 * @returns {string}
 */
function toMetalsmithDestFilename(metalsmith, filepath) {
  return path.relative(metalsmith.destination(), path.resolve(filepath));
}
exports.toMetalsmithDestFilename = toMetalsmithDestFilename;

/**
 * @param {Object} metalsmith
 * @param {Object.<string, *>} files
 * @param {string} filepath
 * @param {string|Buffer} contents
 * @returns {{filename: string}}
 */
exports.addMetalsmithFile = (metalsmith, files, filepath, contents) => {
  const filename = toMetalsmithDestFilename(metalsmith, filepath);
  pluginKit.addFile(files, filename, contents);
  return { filename };
};
