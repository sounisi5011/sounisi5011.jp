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

const readFileAsync = util.promisify(fs.readFile);
exports.readFileAsync = readFileAsync;

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

/**
 * @typedef {function(string, Object.<string, function(string): string|false|null>|function({ label:string, body:string }): string|false|null): string} GroupReplacer
 * @typedef {function(string, Object.<string, string | function({ globalVarName:string }): string|false|null>|function({ globalVarName:string, label:string }): string|false|null): string} VarReplacer
 * @param {string|string[]} templateFilepath
 * @param {function(string, { groupReplacer: GroupReplacer, variableReplacer: VarReplacer }): string} callback
 * @param {Promise.<string>}
 */
exports.templateConverter = async (templateFilepath, callback) => {
  /** @type {GroupReplacer} */
  const groupReplacer = (text, replacer) => {
    return text.replace(
      /\/\* +__((?:(?!(?::start__ +)?\*\/).)+):start__ +\*\/((?:(?!\/\* +__\1:end__ +\*\/).)*)\/\* +__\1:end__ +\*\//gs,
      (matchText, label, body) => {
        let replacedText;
        if (typeof replacer === 'function') {
          replacedText = replacer({ label, body });
        } else {
          if (typeof replacer[label] !== 'function') return matchText;
          replacedText = replacer[label](body);
        }
        return (typeof replacedText === 'string' || replacedText)
          ? replacedText
          : matchText;
      },
    );
  };
  /** @type {VarReplacer} */
  const variableReplacer = (text, replacer) => {
    return text.replace(
      /\b(window|this|self)\.__(\w+)__\b/g,
      (matchText, globalVarName, label) => {
        let replacedText;
        if (typeof replacer === 'function') {
          replacedText = replacer({ globalVarName, label });
        } else {
          replacedText = replacer[label];
          if (typeof replacedText === 'function') {
            replacedText = replacedText({ globalVarName });
          }
        }
        return (typeof replacedText === 'string' || replacedText)
          ? replacedText
          : matchText;
      },
    );
  };

  const templatePath = Array.isArray(templateFilepath)
    ? path.resolve(...templateFilepath)
    : templateFilepath;
  let templateText = templateCache.get(templatePath);
  if (typeof templateText !== 'string') {
    templateText = await readFileAsync(templatePath, 'utf8');
    templateCache.set(templatePath, templateText);
  }
  return callback(templateText, { groupReplacer, variableReplacer });
};
const templateCache = new Map();
