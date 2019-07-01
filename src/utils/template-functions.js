const path = require('path');

const strictUriEncode = require('strict-uri-encode');

const hashFuncs = require('./hash');

Object.assign(exports, hashFuncs);

function path2url(pathstr) {
  return pathstr
    .split(path.sep === '\\' ? /[\\/]/ : path.sep)
    .map(strictUriEncode)
    .join('/');
}
exports.path2url = path2url;

function canonicalURL(rootURL, pathOrURL) {
  if (/^(?:https?:)?[/]{2}/.test(pathOrURL)) {
    return pathOrURL;
  }
  return (
    rootURL.replace(/[/]*$/, '') +
    path2url(pathOrURL).replace(/^[/]*(?=.)/, '/')
  );
}
exports.canonicalURL = canonicalURL;
