const path = require('path');

const strictUriEncode = require('strict-uri-encode');

const hashFuncs = require('./hash');

// eslint-disable-next-line no-use-before-define
if (typeof URL === 'undefined') {
  var URL = require('url').URL;
}

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

/**
 * @param {string} url
 * @return {string[]}
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/wbr#Example
 */
function yahooStyleURLBreaker(url) {
  const urlData = new URL(url);
  const { href, username, password, port, search, hash } = urlData;

  const authStr = password
    ? `${username}:${password}@`
    : username
    ? `${username}@`
    : '';
  const portStr = port ? `:${port}` : '';
  const hostnameList = urlData.hostname.split(/(?=[.])/);
  const protocolStr =
    urlData.protocol + '//' + authStr + (hostnameList.shift() || '');
  const pathList = urlData.pathname.split(/(?=[/])/);
  const pathFirst =
    (hostnameList.pop() || '') + portStr + (pathList.shift() || '');
  const queryParametersList = search
    ? [search]
    : href.includes('?')
    ? ['?']
    : [];
  const fragmentList = hash ? [hash] : href.includes('#') ? ['#'] : [];

  return [
    protocolStr,
    ...hostnameList,
    pathFirst,
    ...pathList,
    ...queryParametersList,
    ...fragmentList,
  ].reduce((list, v) => {
    if (/^[/]$/.test(v)) {
      v = list.pop() + v;
    }
    return [...list, v];
  }, []);
}

[
  [
    'http://this.is.a.really.long.example.com/With/deeper/level/pages/deeper/level/pages/deeper/level/pages/deeper/level/pages/deeper/level/pages',
    'http://this<wbr>.is<wbr>.a<wbr>.really<wbr>.long<wbr>.example<wbr>.com/With<wbr>/deeper<wbr>/level<wbr>/pages<wbr>/deeper<wbr>/level<wbr>/pages<wbr>/deeper<wbr>/level<wbr>/pages<wbr>/deeper<wbr>/level<wbr>/pages<wbr>/deeper<wbr>/level<wbr>/pages',
  ],
  ['http://example.com/dir-path/', 'http://example<wbr>.com/dir-path/'],
  'https://user:pass@sub.example.com:8080/p/a/t/h?query=string#hash',
  'https://:pass@sub.example.com:8080/p/a/t/h?query=string#hash',
  'https://user:@sub.example.com:8080/p/a/t/h?query=string#hash',
  'https://auth@sub.example.com:8080/p/a/t/h?query=string#hash',
  'http://@sub.example.com:8080/p/a/t/h?query=string#hash',
  'http://sub.example.com:8080/p/a/t/h?query=string#hash',
  'http://sub.example.com:/p/a/t/h?query=string#hash',
  'http://sub.example.com/p/a/t/h?query=string#hash',
  'http://sub.example.com/p/a/t/h?query=string#',
  'http://sub.example.com/p/a/t/h?query=string',
  'http://sub.example.com/p/a/t/h?query',
  'http://sub.example.com/p/a/t/h?',
  'http://sub.example.com/p/a/t/h?#hash',
  'http://sub.example.com/p/a/t/h?#',
  'http://sub.example.com/p/a/t/h#hash',
  'http://sub.example.com/p/a/t/h#',
  'http://sub.example.com/p/a/t/h',
  'http://sub.example.com/path/',
  'http://sub.example.com/path',
  'http://sub.example.com/',
  'http://sub.example.com',
].forEach(urlList => {
  if (typeof urlList === 'string') {
    const url = urlList;
    const joinURL = yahooStyleURLBreaker(url).join('');
    const normalizedURL = String(new URL(url));
    if (joinURL !== normalizedURL) {
      throw new Error(
        [
          'yahooStyleURLBreaker() is broken:',
          '  joinURL !== normalizedURL',
          '',
          `  url = ${JSON.stringify(url)}`,
          `  joinURL = yahooStyleURLBreaker(url).join('')`,
          `  // ${JSON.stringify(joinURL)}`,
          `  normalizedURL = String(new URL(url))`,
          `  // ${JSON.stringify(normalizedURL)}`,
        ].join('\n'),
      );
    }
  } else if (Array.isArray(urlList)) {
    const [url, html] = urlList;
    const joinURL = yahooStyleURLBreaker(url).join('<wbr>');

    if (joinURL !== html) {
      throw new Error(
        [
          'yahooStyleURLBreaker() is broken:',
          '  joinURL !== html',
          '',
          `  url = ${JSON.stringify(url)}`,
          `  joinURL = yahooStyleURLBreaker(url).join('<wbr>')`,
          `  // ${JSON.stringify(joinURL)}`,
          `  html = ${JSON.stringify(html)}`,
        ].join('\n'),
      );
    }
  }
});

Object.assign(exports, { yahooStyleURLBreaker });
