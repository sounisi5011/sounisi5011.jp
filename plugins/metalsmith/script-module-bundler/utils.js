const fs = require('fs');
const util = require('util');

const Terser = require('terser');

exports.toJsValue = value =>
  JSON.stringify(value).replace(
    /[\u2028\u2029]/g,
    char => `\\u${char.codePointAt(0).toString(16)}`,
  );

exports.readFileAsync = util.promisify(fs.readFile);

exports.minifyJS = (code, options) => {
  const result = Terser.minify(code, options);
  if (result.error) throw result.error;
  return result.code;
};
