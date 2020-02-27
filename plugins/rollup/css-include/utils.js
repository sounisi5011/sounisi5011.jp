const path = require('path');

exports.toJsValue = value =>
  JSON.stringify(value).replace(
    /[\u2028\u2029]/g,
    char => `\\u${char.codePointAt(0).toString(16)}`,
  );

exports.filename2urlPath = filename => {
  const url = new URL('https://example.com');
  url.pathname = filename;
  return url.pathname;
};

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
