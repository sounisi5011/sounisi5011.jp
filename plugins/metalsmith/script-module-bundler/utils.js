const fs = require('fs');
const util = require('util');

exports.toJsValue = value =>
  JSON.stringify(value).replace(
    /[\u2028\u2029]/g,
    char => `\\u${char.codePointAt(0).toString(16)}`,
  );

exports.readFileAsync = util.promisify(fs.readFile);
