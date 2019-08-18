/*
 * https://github.com/ExtraHop/metalsmith-sitemap の書き換え。以下の機能変更：
 *
 * - 最新のsitemap.jsを使用する。
 * - ファイルパスを正しくURLエンコードする。
 * - hostnameオプションをコールバックに対応させる。
 * - Frontmatterのsitemapフィールドを読み、任意のオプションをsitemap.jsに渡す。
 * - sitemap.jsのエラーをthrowする。
 */
const path = require('path');
const util = require('util');

const get = require('lodash.get');
const multimatch = require('multimatch');
const { createSitemap } = require('sitemap');
const strictUriEncode = require('strict-uri-encode');

const indexFile = 'index.html';

const objFromEntries =
  Object.fromEntries ||
  (iterable =>
    [...iterable].reduce(
      (obj, [prop, value]) => ({ ...obj, [prop]: value }),
      {},
    ));

function overwriteErrorMessage(error, message) {
  const originalMsg = error.message;
  const originalStack = error.stack;
  const originalMsgStartPos = error.stack.indexOf(originalMsg);

  error.message = message;
  error.stack =
    originalStack.slice(0, originalMsgStartPos) +
    message +
    originalStack.slice(originalMsgStartPos + originalMsg.length);

  return error;
}

function check(filename, filedata, options) {
  if (get(filedata, options.privateProperty)) {
    return false;
  }

  return true;
}

function buildUrl(filename, filedata, options) {
  const canonicalUrl = get(filedata, options.urlProperty);
  if (typeof canonicalUrl === 'string') {
    return canonicalUrl;
  }

  if (options.omitIndex && path.basename(filename) === indexFile) {
    return path2url(filename.slice(0, 0 - indexFile.length));
  }

  if (options.omitExtension) {
    return path2url(filename.slice(0, 0 - path.extname(filename).length));
  }

  return path2url(filename);
}

function path2url(pathstr) {
  return path
    .join('/', pathstr)
    .split(path.sep)
    .map(strictUriEncode)
    .join('/');
}

module.exports = opts => {
  const options = {
    modifiedProperty: 'lastmod',
    output: 'sitemap.xml',
    pattern: '**/*.html',
    priorityProperty: 'priority',
    privateProperty: 'private',
    urlProperty: 'canonical',
    ...(['string', 'function'].includes(typeof opts)
      ? { hostname: opts }
      : opts),
  };
  if (!options.hostname) {
    throw new Error('"hostname" option required');
  }

  return (files, metalsmith, done) => {
    const sitemap = createSitemap({
      cacheTime: options.cacheTime,
      hostname:
        typeof options.hostname === 'function'
          ? options.hostname(files, metalsmith)
          : options.hostname,
      level: 'throw',
      xmlNs: options.xmlNs,
      xslUrl: options.xslUrl,
    });

    multimatch(Object.keys(files), options.pattern)
      .map(filename => [filename, files[filename]])
      .filter(([filename, filedata]) => check(filename, filedata, options))
      .forEach(([filename, filedata]) => {
        const entry = objFromEntries(
          Object.entries({
            changefreq: filedata.changefreq || options.changefreq,
            lastmod: get(filedata, options.modifiedProperty) || options.lastmod,
            links: get(filedata, options.links),
            priority:
              get(filedata, options.priorityProperty) || options.priority,
          }).filter(([, value]) => value !== undefined),
        );

        if (typeof filedata.sitemap === 'object') {
          Object.assign(entry, filedata.sitemap);
        }

        entry.url = buildUrl(filename, filedata, options);

        try {
          sitemap.add(entry, 'throw');
        } catch (error) {
          throw overwriteErrorMessage(
            error,
            `sitemap.js error at file ${util.inspect(filename)}: ${
              error.message
            }`,
          );
        }
      });

    files[options.output] = {
      contents: Buffer.from(sitemap.toString(), 'utf8'),
      mode: '0644',
    };

    done();
  };
};
