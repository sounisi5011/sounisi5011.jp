const path = require('path');

const strictUriEncode = require('strict-uri-encode');

function path2url(pathstr) {
  return pathstr
    .split(path.sep === '\\' ? /[\\/]/ : path.sep)
    .map(strictUriEncode)
    .join('/');
}
exports.path2url = path2url;

function canonicalURL(rootURL, path) {
  return (
    rootURL.replace(/[/]*$/, '') + path2url(path).replace(/^[/]*(?=.)/, '/')
  );
}
exports.canonicalURL = canonicalURL;
