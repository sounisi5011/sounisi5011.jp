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

/**
 * Dateオブジェクトを見やすい表示に変換する
 * @param {!Date} date 変換元のDateオブジェクト
 * @param {string} format 変換形式を指定する文字列。UNIXのdateコマンド互換
 * @param {number} timezoneSec タイムゾーンの秒数。
 *     例えば、+09:00のタイムゾーンを指定したい場合は、
 *     32400（`9 * 60 * 60`の計算結果）を指定する
 * @see https://github.com/sounisi5011/novel-dinner-from-twitter-977500688279154688/blob/9413effa03c43ac512b9d1e59c5e4f236d9f6f3d/src/pug/_funcs.pug#L52-L188
 */
function formatDate(
  date,
  format = '%Y-%m-%dT%H:%M:%S%:z',
  timezoneSec = undefined,
) {
  /*
   * 引数の型チェックを行う
   */
  if (!(date && date instanceof Date)) {
    throw new TypeError(
      'formatDate(date, format, timezoneSec):\n' +
        `  date parameter must be Date object.\n` +
        `  buy it's value: ${JSON.stringify(date)}.`,
    );
  }
  if (typeof format !== 'string') {
    throw new TypeError(
      'formatDate(date, format, timezoneSec):\n' +
        `  format parameter must be string.\n` +
        `  buy it's value: ${JSON.stringify(format)}.`,
    );
  }
  if (!Number.isFinite(timezoneSec)) {
    throw new TypeError(
      'formatDate(date, format, timezoneSec):\n' +
        `  timezoneSec parameter must be finite number.\n` +
        `  buy it's value: ${JSON.stringify(timezoneSec)}.`,
    );
  }
  /*
   * timezoneSecパラメータの小数部を切り捨てる。
   */
  timezoneSec = Math.trunc(timezoneSec);
  /*
   * Dateオブジェクトから、タイムゾーンの秒数を取得する
   */
  const systemTimezoneSec = date.getTimezoneOffset() * -1 * 60;
  /*
   * timezoneSecの値が範囲内かを判定
   */
  if (!(-(24 * 3600) < timezoneSec)) {
    throw new TypeError(
      'formatDate(date, format, timezoneSec):\n' +
        `  timezoneSec parameter must be greater than ${-(24 * 3600)} ` +
        `( ${-(24 * 3600)} < timezoneSec ).\n` +
        `  buy it's value: ${timezoneSec}.`,
    );
  } else if (!(timezoneSec < 24 * 3600)) {
    throw new TypeError(
      'formatDate(date, format, timezoneSec):\n' +
        `  timezoneSec parameter must be less than ${24 * 3600} ` +
        `( timezoneSec < ${24 * 3600} ).\n` +
        `  buy it's value: ${timezoneSec}.`,
    );
  }
  /*
   * タイムゾーンに合わせて、Dateオブジェクトの時間をずらす
   */
  const unixtime = date.getTime();
  date = new Date(unixtime - (systemTimezoneSec - timezoneSec) * 1000);
  /*
   * タイムゾーンの文字列に使用する値を求める
   */
  const timezoneSign = timezoneSec < 0 ? '-' : '+';
  const timezoneAbs = Math.abs(timezoneSec);
  const timezoneH = String(Math.floor(timezoneAbs / 3600)).padStart(2, '0');
  const timezoneM = String(Math.floor((timezoneAbs % 3600) / 60)).padStart(
    2,
    '0',
  );
  const timezoneS = String(timezoneAbs % 60).padStart(2, '0');
  /*
   * ナノ秒の数値文字列を生成する
   */
  const ns = String(date.getMilliseconds()).padStart(3, '0') + '0'.repeat(6);
  /*
   * 置換元と置換先の組み合わせを定義する
   */
  const replaceDict = {
    /* eslint-disable sort-keys */
    '%%': '%',
    '%Y': String(date.getFullYear()),
    '%-m': String(date.getMonth() + 1),
    '%m': String(date.getMonth() + 1).padStart(2, '0'),
    '%-d': String(date.getDate()),
    '%d': String(date.getDate()).padStart(2, '0'),
    '%-H': String(date.getHours()),
    '%H': String(date.getHours()).padStart(2, '0'),
    '%-M': String(date.getMinutes()),
    '%M': String(date.getMinutes()).padStart(2, '0'),
    '%-S': String(date.getSeconds()),
    '%S': String(date.getSeconds()).padStart(2, '0'),
    '%s': String(date.getTime()),
    '%N': ns,
    '%1N': ns.substr(0, 1),
    '%2N': ns.substr(0, 2),
    '%3N': ns.substr(0, 3),
    '%4N': ns.substr(0, 4),
    '%5N': ns.substr(0, 5),
    '%6N': ns.substr(0, 6),
    '%7N': ns.substr(0, 7),
    '%8N': ns.substr(0, 8),
    '%9N': ns.substr(0, 9),
    '%z': `${timezoneSign}${timezoneH}${timezoneM}`,
    '%:z': `${timezoneSign}${timezoneH}:${timezoneM}`,
    '%::z': `${timezoneSign}${timezoneH}:${timezoneM}:${timezoneS}`,
    /* eslint-enable sort-keys */
  };
  /*
   * 置換する
   * Note: この実装では、例えば"constructor"のような値を
   *       置換しようとした時に正しく動作しない。
   *       これは、オブジェクトのプロトタイプにconstructorメソッドが存在するためで、
   *       適切な動作を求めるならhasOwnPropertyメソッドで
   *       プロパティの存在判定をする必要がある。
   *       が、今回の場合はいずれも"%〜"のような値だけを置換するため、
   *       冗長な判定は使用していない。
   */
  return format.replace(
    /%(?:y|-?[mdhms%]|[1-9]n|:{0,2}z)/gi,
    match => replaceDict[match] || match,
  );
}
Object.assign(exports, { formatDate });
