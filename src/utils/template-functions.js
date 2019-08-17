const path = require('path');

const strictUriEncode = require('strict-uri-encode');

const hashFuncs = require('./hash');

// eslint-disable-next-line no-use-before-define
if (typeof URL === 'undefined') {
  var URL = require('url').URL;
}

Object.assign(exports, hashFuncs);

function dateEquals(a, b) {
  if (!(a && a instanceof Date)) {
    throw new TypeError(
      'dateEquals(a, b):\n' +
        `  "a" parameter must be Date object.\n` +
        `  buy it's value: ${JSON.stringify(a)}.`,
    );
  }
  if (!(b && b instanceof Date)) {
    throw new TypeError(
      'dateEquals(a, b):\n' +
        `  "b" parameter must be Date object.\n` +
        `  buy it's value: ${JSON.stringify(b)}.`,
    );
  }

  return a.getTime() === b.getTime();
}
Object.assign(exports, { dateEquals });

function unique(...args) {
  return [...new Set(args)];
}
Object.assign(exports, { unique });

function findPropValue(objList, propName) {
  const obj = objList.find(obj => obj.hasOwnProperty(propName));
  return obj ? obj[propName] : undefined;
}
Object.assign(exports, { findPropValue });

function compareUnicode(a, b) {
  const aChars = [...a];
  const bChars = [...b];
  const aLen = aChars.length;
  const bLen = bChars.length;

  const minLen = Math.min(aLen, bLen);
  for (let index = 0; index < minLen; index++) {
    const aCode = aChars[index].codePointAt(0);
    const bCode = bChars[index].codePointAt(0);

    if (aCode !== bCode) {
      return aCode - bCode;
    }
  }

  return aLen - bLen;
}
Object.assign(exports, { compareUnicode });

function path2url(pathstr) {
  return pathstr
    .split(path.sep === '\\' ? /[\\/]/ : path.sep)
    .map(strictUriEncode)
    .join('/');
}
exports.path2url = path2url;

function rootRrelativeURL(...paths) {
  return path
    .join('/', ...paths.map(pathstr => path.normalize(pathstr)))
    .split(path.sep)
    .map(strictUriEncode)
    .join('/');
}
Object.assign(exports, { rootRrelativeURL });

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

function urlSplitter(url) {
  // TODO: もっと追加する
  //       https://techracho.bpsinc.jp/hachi8833/2017_11_28/48435
  const invisiblePatternList = [
    // スペース文字
    // 参考：https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
    String.raw`\s`,
    // General Punctuationブロックの不可視文字
    // 参考：https://ja.wikipedia.org/wiki/%E4%B8%80%E8%88%AC%E5%8F%A5%E8%AA%AD%E7%82%B9_(Unicode%E3%81%AE%E3%83%96%E3%83%AD%E3%83%83%E3%82%AF)#_%E6%96%87%E5%AD%97%E8%A1%A8
    String.raw`\u{2000}-\u{200F}\u{2011}\u{2028}-\u{202F}\u{205F}-\u{206F}`,
    // 双方向テキストの制御文字
    // 参考：https://ja.wikipedia.org/wiki/%E5%8F%8C%E6%96%B9%E5%90%91%E3%83%86%E3%82%AD%E3%82%B9%E3%83%88#Unicode
    String.raw`\u{061C}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}`,
  ];
  const invisibleCharPattern = new RegExp(
    String.raw`[${invisiblePatternList.join('')}]+`,
    'gu',
  );

  function decodePercentEncoded(str) {
    // TODO: 合成済み文字（合成済み文字以外の表記方法が存在しない絵文字やブラーフミー文字などは除外）、制御文字、
    //       一般的な文字と字形が酷似している文字などをデコードしない
    return (
      decodeURIComponent(str)
        // 視認できない文字は見分けがつかないのでパーセントエンコードしたままにする
        .replace(invisibleCharPattern, sp => strictUriEncode(sp))
    );
  }

  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]+)((?:\/[^?#]*)?)((?:\?[^#]*)?)((?:#.*)?)$/i.exec(
    url,
  );
  if (!match) {
    throw new TypeError(
      `urlSplitter(url): invalid url: ${JSON.stringify(url)}.`,
    );
  }

  const [, scheme, host, path, query, fragment] = match;
  const origin = scheme + host;

  return path
    .split('/')
    .map((segment, index, segmentList) => {
      const data = {
        isLastPathSegment: index === segmentList.length - 1,
      };

      if (index === 0) {
        return {
          ...data,
          beforeSplit: scheme,
          href: {
            absolute: origin,
            rootRelative: '/',
          },
          value: {
            // TODO: デコード済ドメイン名のプロパティを追加
            raw: host,
          },
        };
      } else {
        const rootRelativeHref = segmentList.slice(0, index + 1).join('/');
        return {
          ...data,
          beforeSplit: '/',
          href: {
            absolute: origin + rootRelativeHref,
            rootRelative: rootRelativeHref,
          },
          value: {
            dangerDecoded: decodeURIComponent(segment),
            decoded: decodePercentEncoded(segment),
            raw: segment,
          },
        };
      }
    })
    .concat(
      query
        ? {
            beforeSplit: '?',
            href: {
              absolute: origin + path + query,
              rootRelative: path + query,
            },
            value: {
              // TODO: デコード済クエリストリングのプロパティを追加
              raw: query.substring(1),
            },
          }
        : [],
      fragment
        ? {
            beforeSplit: '#',
            href: {
              absolute: origin + path + query + fragment,
              rootRelative: path + query + fragment,
            },
            value: {
              // TODO: 安全なデコード済ハッシュフラグメントのプロパティを追加
              dangerDecoded: decodeURIComponent(fragment.substring(1)),
              raw: fragment.substring(1),
            },
          }
        : [],
    )
    .map((data, index, self) => {
      return Object.assign(data, {
        afterSplit: self[index + 1] && self[index + 1].beforeSplit,
        first: self[0],
        isLastPathSegment: Boolean(data.isLastPathSegment),
        last: self[self.length - 1],
        next: self[index + 1],
        prev: self[index - 1],
      });
    });
}
Object.assign(exports, { urlSplitter });

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

function dateDiff(date1, date2, timezone = 0) {
  const minTZ = -(24 * 60);
  const maxTZ = 24 * 60;

  if (!(date1 && date1 instanceof Date)) {
    throw new TypeError(
      'dateDiff(date1, date2, timezone):\n' +
        `  date1 parameter must be Date object.\n` +
        `  buy it's value: ${JSON.stringify(date1)}.`,
    );
  }
  if (!(date2 && date2 instanceof Date)) {
    throw new TypeError(
      'dateDiff(date1, date2, timezone):\n' +
        `  date2 parameter must be Date object.\n` +
        `  buy it's value: ${JSON.stringify(date2)}.`,
    );
  }
  if (!Number.isFinite(timezone)) {
    throw new TypeError(
      'dateDiff(date1, date2, timezone):\n' +
        `  timezone parameter must be finite number.\n` +
        `  buy it's value: ${JSON.stringify(timezone)}.`,
    );
  }
  if (!(minTZ < timezone)) {
    throw new TypeError(
      'dateDiff(date1, date2, timezone):\n' +
        `  timezone parameter must be greater than ${minTZ} ` +
        `( ${minTZ} < timezone ).\n` +
        `  buy it's value: ${timezone}.`,
    );
  } else if (!(timezone < maxTZ)) {
    throw new TypeError(
      'dateDiff(date1, date2, timezone):\n' +
        `  timezone parameter must be less than ${maxTZ} ` +
        `( timezone < ${maxTZ} ).\n` +
        `  buy it's value: ${timezone}.`,
    );
  }

  if (timezone !== 0) {
    const timezoneMSec = timezone * 60 * 1000;
    date1 = new Date(date1.getTime() + timezoneMSec);
    date2 = new Date(date2.getTime() + timezoneMSec);
  }

  return {
    /* eslint-disable sort-keys */
    get year() {
      return date1.getUTCFullYear() - date2.getUTCFullYear();
    },
    get month() {
      return date1.getUTCMonth() - date2.getUTCMonth();
    },
    get day() {
      return date1.getUTCDate() - date2.getUTCDate();
    },
    get hour() {
      return date1.getUTCHours() - date2.getUTCHours();
    },
    get min() {
      return date1.getUTCMinutes() - date2.getUTCMinutes();
    },
    get sec() {
      return date1.getUTCSeconds() - date2.getUTCSeconds();
    },
    get msec() {
      return date1.getUTCMilliseconds() - date2.getUTCMilliseconds();
    },
    /* eslint-enable */
  };
}
Object.assign(exports, { dateDiff });

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
  if (timezoneSec !== 0) {
    const unixtime = date.getTime();
    const timezoneMSec = timezoneSec * 1000;
    date = new Date(unixtime + timezoneMSec);
  }
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
  const ns = String(date.getUTCMilliseconds()).padStart(3, '0') + '0'.repeat(6);
  /*
   * 置換元と置換先の組み合わせを定義する
   */
  const replaceDict = {
    /* eslint-disable sort-keys */
    '%%': '%',
    '%Y': String(date.getUTCFullYear()),
    '%-m': String(date.getUTCMonth() + 1),
    '%m': String(date.getUTCMonth() + 1).padStart(2, '0'),
    '%-d': String(date.getUTCDate()),
    '%d': String(date.getUTCDate()).padStart(2, '0'),
    '%-H': String(date.getUTCHours()),
    '%H': String(date.getUTCHours()).padStart(2, '0'),
    '%-M': String(date.getUTCMinutes()),
    '%M': String(date.getUTCMinutes()).padStart(2, '0'),
    '%-S': String(date.getUTCSeconds()),
    '%S': String(date.getUTCSeconds()).padStart(2, '0'),
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
  /**
   * @see https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-global-date-and-time-string
   */
  replaceDict['%<time>'] = [
    [replaceDict['%Y'], replaceDict['%m'], replaceDict['%d']].join('-'),
    'T',
    [
      replaceDict['%H'],
      replaceDict['%M'],
      replaceDict['%S'] + '.' + replaceDict['%3N'],
    ].join(':'),
    timezoneSec === 0 ? 'Z' : replaceDict['%:z'],
  ].join('');
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
    new RegExp(Object.keys(replaceDict).join('|'), 'g'),
    match => replaceDict[match] || match,
  );
}
Object.assign(exports, { formatDate });
