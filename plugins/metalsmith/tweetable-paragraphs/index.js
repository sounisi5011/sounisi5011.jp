const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');
const util = require('util');

const cheerio = require('cheerio');
const logger = require('debug');
const pluginKit = require('metalsmith-plugin-kit');
const QRCode = require('qrcode');
const strictUriEncode = require('strict-uri-encode');
const twitter = require('twitter-text');

const debug = logger(require('./package.json').name);

const ASSETS_DIR = '_fragment-anchors';

/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @see https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
const HTML_WS_REGEXP = /[\t\n\f\r ]+/g;

function first(list, defaultValue) {
  if (list.length < 1 && arguments.length >= 2) {
    list.push(defaultValue);
  }
  return list[0];
}

function last(list) {
  return list[list.length - 1];
}

function unicodeLength(str) {
  return [...str].length;
}

function sha1(data) {
  return crypto
    .createHash('sha1')
    .update(data)
    .digest('hex');
}

/**
 * @param {string} filepath
 * @returns {string}
 * Note: WHATWG URL APIは以下の問題があるため使用しない:
 *       - バックスラッシュをスラッシュに置換してしまう。Unixでは、バックスラッシュもファイル名の一部
 *       - 連続するスラッシュを省略しない。
 */
function filepath2RootRelativeURL(filepath) {
  const normalizedRootPath = path.join(path.sep, filepath);
  return normalizedRootPath
    .split(path.sep)
    .map(strictUriEncode)
    .join('/');
}

function getURL($) {
  const metaElemDefs = [
    {
      attr: 'content',
      query: 'meta[property="og:url"]',
    },
    {
      attr: 'href',
      query: 'link[rel=canonical]',
    },
    {
      attr: 'href',
      query: 'base',
    },
  ];

  const $head = $('head');
  for (const { query, attr } of metaElemDefs) {
    const value = $head.find(query).attr(attr);
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      return value;
    }
  }

  return undefined;
}

function getValidTweetLength(tweetText, suffixText = '') {
  const tweet = twitter.parseTweet(tweetText + suffixText);

  if (tweet.valid) {
    return null;
  }

  let validTweetLength = Math.min(tweetText.length - 1, tweet.validRangeEnd);
  while (validTweetLength >= 0) {
    if (
      twitter.parseTweet(tweetText.substring(0, validTweetLength) + suffixText)
        .valid
    ) {
      break;
    }
    validTweetLength--;
  }

  return validTweetLength;
}

function createData($, idNode, text = '') {
  const id = idNode && $(idNode).attr('id');
  return {
    id: id !== undefined ? id : null,
    idNode,
    margin: {
      bottom: -1,
      top: -1,
    },
    rawText: text,
    text: text.replace(HTML_WS_REGEXP, ' '),
  };
}

function readTextContents($, elem, opts = {}, prevIdNode = null) {
  const options = {
    ignoreElems: ['style', 'script', 'template'],
    replacer: (node, dataList) => dataList,
    ...opts,
  };
  const ignoreElemSelector = options.ignoreElems.join(', ');

  const $elem = $(elem);
  const dataList = [];

  $elem.each((i, node) => {
    const $node = $(node);

    if (node.type === 'text') {
      dataList.push(createData($, prevIdNode, node.data));
    } else if (node.type === 'tag' && !$node.is(ignoreElemSelector)) {
      let currentIdNode = $node.is('[id]') ? node : prevIdNode;
      /**
       * @see https://chromium.googlesource.com/chromium/blink/+/master/Source/core/css/html.css
       * @see https://dxr.mozilla.org/mozilla-central/source/layout/style/res/html.css
       * @see http://trac.webkit.org/browser/trunk/Source/WebCore/css/html.css
       */
      const isPreElem = $node.is('pre, xmp, plaintext, listing, textarea');
      const isPElem = $node.is(
        'p, blockquote, figure, h1, h2, h3, h4, h5, h6, hr, ul, menu, dir, ol, dl, multicol, pre, xmp, plaintext, listing',
      );

      const newDataList = $node
        .contents()
        .get()
        .reduce(
          (list, childNode) => {
            const data = readTextContents(
              $,
              $(childNode),
              options,
              currentIdNode,
            );

            /*
             * pre要素の内容のスペース文字は保持する
             */
            if (isPreElem) {
              data.forEach(data => {
                data.text = data.rawText;
              });
            }

            if (last(data)) {
              currentIdNode = last(data).idNode;
            }

            const firstDataItem = data[0];
            const lastListItem = last(list);
            if (firstDataItem && lastListItem) {
              if (lastListItem.idNode === firstDataItem.idNode) {
                /*
                 * 前後のマージンの数だけ空行を生成する
                 */
                const marginLinesNumber = Math.max(
                  lastListItem.margin.bottom,
                  firstDataItem.margin.top,
                );
                const marginLines = '\n'.repeat(
                  Math.max(0, 1 + marginLinesNumber),
                );

                lastListItem.rawText += marginLines + firstDataItem.rawText;
                lastListItem.text += marginLines + firstDataItem.text;
                data.shift();
              }
            }

            return [...list, ...data];
          },
          currentIdNode !== null ? [createData($, currentIdNode)] : [],
        );

      /*
       * br要素の内容は改行にする
       */
      if ($node.is('br')) {
        const firstData = newDataList[0];
        if (firstData) {
          firstData.text = firstData.rawText = '\n';
        } else {
          newDataList.push(createData($, currentIdNode, '\n'));
        }
      }

      /*
       * p要素の前後には、一行のマージンを追加する
       */
      if (isPElem) {
        const margin = 1;
        const firstData = first(newDataList, createData($, currentIdNode));
        const lastData = last(newDataList);
        firstData.margin.top = Math.max(margin, firstData.margin.top);
        lastData.margin.bottom = Math.max(margin, lastData.margin.bottom);
      }

      dataList.push(...newDataList);
    }
  });

  return options.replacer($elem, dataList);
}

module.exports = opts => {
  const options = Object.defineProperties(
    {
      filter: (filename, filedata, metalsmith, files) => true,
      generateFragmentPageURL: (url, id) => url + '#' + strictUriEncode(id),
      ignoreElems: ['style', 'script', 'template'],
      pattern: '**/*.html',
      rootSelector: 'body',
      textContentsReplacer: ($elem, childTextDataList) => childTextDataList,
      allowWarning: true,
    },
    Object.getOwnPropertyDescriptors(opts),
  );

  const redirectsSet = new Set();
  const warningList = [];
  /** @type {{filepath: string, message: string;}[][]} */
  const errorListList = [];

  return pluginKit.middleware({
    match: options.pattern,
    async each(filename, filedata, files, metalsmith) {
      if (!options.filter(filename, filedata, metalsmith, files)) {
        return;
      }

      debug(`processing file: ${util.inspect(filename)}`);

      let $;
      try {
        $ = cheerio.load(filedata.contents.toString());
      } catch (err) {
        return;
      }

      const newErrorList = [];
      let isUpdated = false;
      const idList = [];

      const pageURL = getURL($);
      if (!pageURL) {
        newErrorList.push({
          filepath: filename,
          message:
            'ページの絶対URLを取得できませんでした。OGPのmeta要素、正規URLを指定するlink要素、または、絶対URLが記述されたbase要素が必要です',
        });
      } else {
        $(options.rootSelector).each((i, elem) => {
          const $root = $(elem);
          const dataList = readTextContents($, $root, {
            ignoreElems: options.ignoreElems,
            replacer: options.textContentsReplacer,
          });

          const usedIdMap = new Map();
          dataList.forEach(({ id, idNode, text }) => {
            if (!idNode) {
              newErrorList.push({
                filepath: filename,
                message:
                  'id属性が割り当てられていない内容が存在します。id属性を追加し、全ての位置のハッシュフラグメントを提供してください',
              });
              return;
            }

            if (id === '') {
              newErrorList.push({
                filepath: filename,
                message: 'id属性は空文字列を許可していません',
              });
              return;
            }

            if (HTML_WS_REGEXP.test(id)) {
              newErrorList.push({
                filepath: filename,
                message: `id属性値にASCIIホワイトスペース文字を含めることはできません: ${util.inspect(
                  id,
                )}`,
              });
              return;
            }

            if (usedIdMap.has(id)) {
              if (usedIdMap.get(id) !== idNode) {
                newErrorList.push({
                  filepath: `${filename}#${id}`,
                  message:
                    'id属性が重複しています。idの値はユニークでなければなりません',
                });
              }
            } else {
              usedIdMap.set(id, idNode);
            }

            const fragmentPageURL = options.generateFragmentPageURL(
              pageURL,
              id,
            );
            const validTweetLength = getValidTweetLength(
              text,
              '\u{0020}' + fragmentPageURL,
            );

            if (validTweetLength) {
              const lengthOutText = text.substring(validTweetLength);
              const outLen = unicodeLength(lengthOutText);
              newErrorList.push({
                filepath: `${filename}#${id}`,
                message:
                  `テキストが長すぎます。以下のテキストを削除し、あと${outLen}文字減らしてください:\n\n` +
                  lengthOutText.replace(/^/gm, '  > '),
              });
              return;
            }

            if (/(?:\s*\n){3,}/.test(text)) {
              warningList.push({
                filename,
                id,
                message:
                  '2行以上の空行はTwitterでは無視されます。空行の間にid属性を追加し、個別のツイートに分離することを推奨します:',
                text,
              });
            }

            const $idElem = $(idNode);
            $idElem.attr('data-share-url', fragmentPageURL);
            $idElem.attr('data-share-text', text);

            idList.push({ fragmentPageURL, id });

            isUpdated = true;
          });

          $root.find(options.ignoreElems.join(', ')).each((i, elem) => {
            const $elem = $(elem);
            $elem.attr('data-share-ignore', '');
          });
        });
      }

      if (newErrorList.length >= 1) {
        errorListList.push(newErrorList);
        return;
      }

      if (isUpdated) {
        filedata.contents = Buffer.from($.html());
        debug(`contents updated: ${util.inspect(filename)}`);

        /**
         * @see https://developers.facebook.com/docs/sharing/best-practices#images
         */
        const ogpQrWidth = 400;
        /**
         * @see https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/summary
         */
        const twitterCardQrWidth = 144;

        const $root = $(':root');
        const $head = $('head');
        let $refreshMeta;
        let ogpImageElem;
        const twitterCardImageElems = $head.find('meta[name="twitter:image"]');
        const twitterCardImageFound = Boolean(
          twitterCardImageElems >= 1 && twitterCardImageElems.attr('content'),
        );

        $root.attr('data-canonical-url', pageURL);

        for (const { id, fragmentPageURL } of idList) {
          $root.attr('data-jump-id', id);

          /**
           * クロールを禁止するrobotsメタタグを追加
           * @see https://developers.google.com/search/reference/robots_meta_tag?hl=ja
           */
          const $metaRobots = $head.find('meta[name=robots]');
          if ($metaRobots.length >= 1) {
            $metaRobots.each((i, elem) => {
              const $meta = $(elem);
              if (i === 0) {
                $meta.attr('content', 'noindex');
              } else {
                $meta.remove();
              }
            });
          } else {
            $head.append('<meta name="robots" content="noindex">');
          }

          /*
           * OGPタグのURLを上書き
           */
          $head.find('meta[property="og:url"]').each((i, elem) => {
            const $meta = $(elem);
            if (i === 0) {
              $meta.attr('content', fragmentPageURL);
            } else {
              $meta.remove();
            }
          });

          const encodedID = strictUriEncode(id);
          const urlWithFragment = pageURL + '#' + encodedID;
          const qrCodeBasename = sha1(`${encodedID}/${filename}`);

          /*
           * スクリプトが機能しない環境向けのリダイレクトタグを追加
           */
          if (!$refreshMeta) {
            const $meta = $('<meta http-equiv="refresh">');
            const $noscript = $('<noscript></noscript>');
            $noscript.append($meta);

            const $charset = $head.find('meta[charset]').first();
            if ($charset.length >= 1) {
              $charset.after($noscript);
            } else {
              $head.prepend($noscript);
            }

            $refreshMeta = $meta;
          }
          $refreshMeta.attr('content', `0; url=${urlWithFragment}`);

          await Promise.all(
            [
              async () => {
                /*
                 * OGPの画像に、QRコードを追加する
                 */

                if (!ogpImageElem) {
                  ogpImageElem = $('<meta property="og:image">');

                  $head
                    .find(
                      'meta[property="og:image"], meta[property^="og:image:"]',
                    )
                    .first()
                    .before(
                      ogpImageElem,
                      '<meta property="og:image:type" content="image/png">',
                      `<meta property="og:image:width" content="${ogpQrWidth}">`,
                      `<meta property="og:image:height" content="${ogpQrWidth}">`,
                    );
                }

                /*
                 * ページのURLを示すQRコードを生成
                 */
                const qrFilename = path.join(
                  path.dirname(filename),
                  `${qrCodeBasename}.${ogpQrWidth}x${ogpQrWidth}.png`,
                );

                /*
                 * QRコードの画像ファイルを生成
                 */
                pluginKit.addFile(
                  files,
                  qrFilename,
                  await QRCode.toBuffer(urlWithFragment, {
                    type: 'png',
                    width: ogpQrWidth,
                  }),
                );
                debug(`file generated: ${util.inspect(qrFilename)}`);

                const qrFileURL = new URL(pageURL);
                qrFileURL.pathname = qrFilename;
                qrFileURL.search = '';
                qrFileURL.hash = '';

                ogpImageElem.attr('content', String(qrFileURL));
              },
              async () => {
                /*
                 * Twitter Cardの画像が未定義の場合は、URLを示すQRコードを指定する
                 */
                if (!twitterCardImageFound) {
                  /*
                   * ページのURLを示すQRコードを生成
                   */
                  const qrFilename = path.join(
                    path.dirname(filename),
                    `${qrCodeBasename}.${twitterCardQrWidth}x${twitterCardQrWidth}.png`,
                  );
                  pluginKit.addFile(
                    files,
                    qrFilename,
                    await QRCode.toBuffer(urlWithFragment, {
                      type: 'png',
                      width: twitterCardQrWidth,
                    }),
                  );
                  debug(`file generated: ${util.inspect(qrFilename)}`);

                  const qrFileURL = new URL(pageURL);
                  qrFileURL.pathname = qrFilename;
                  qrFileURL.search = '';
                  qrFileURL.hash = '';

                  const twitterCardImageElem = $head.find(
                    'meta[name="twitter:image"]',
                  );
                  if (twitterCardImageElem.length < 1) {
                    const twitterCardImageElem = $(
                      '<meta name="twitter:image">',
                    );
                    twitterCardImageElem.attr('content', String(qrFileURL));
                    $head.append(twitterCardImageElem);
                  } else {
                    twitterCardImageElem.attr('content', String(qrFileURL));
                  }
                }
              },
            ].map(fn => fn()),
          );

          /*
           * ファイルを生成
           */
          const newFilename = path.join(ASSETS_DIR, id, filename);
          pluginKit.addFile(files, newFilename, $.html());

          /*
           * metalsmith-sitemapプラグインが生成するsitemap.xmlにファイルを含めない
           */
          files[newFilename].private = true;

          debug(`file generated: ${util.inspect(newFilename)}`);

          /*
           * リライトのルールを追加
           * @see https://mottox2.com/posts/119
           */
          const filenameURL = filepath2RootRelativeURL(filename);
          const newFilenameURL = filepath2RootRelativeURL(newFilename);
          redirectsSet.add(
            `${filenameURL} fragment=${id} ${newFilenameURL} 200!`,
          );
          redirectsSet.add(
            [
              `${filenameURL.replace(/\/index.html$/, '')} fragment=${id}`,
              newFilenameURL.replace(/\/index.html$/, ''),
              `200!`,
            ].join(' '),
          );
        }
      }
    },
    after(files) {
      const errorList = [].concat(...errorListList).filter(Boolean);

      if (options.allowWarning) {
        warningList.forEach(({ filename, id, message, text }) => {
          console.warn(
            [
              `${filename}#${id}: ${message}`,
              '',
              text.replace(/^/gm, '  > '),
              '',
            ]
              .join('\n')
              .replace(/^(?=[^\r\n])/gm, '  '),
          );
        });
      }
      if (errorList.length >= 1) {
        throw new Error(
          [
            '以下のファイルでエラーが発生しました：',
            '',
            ...errorList.map(({ filepath, message }) =>
              `${filepath}: ${message}\n`.replace(/^(?=[^\r\n])/gm, '  '),
            ),
          ].join('\n'),
        );
      }

      /*
       * _redirectsファイルに書き込む
       */
      let redirectsFiledata = files['_redirects'];
      if (!redirectsFiledata) {
        pluginKit.addFile(
          files,
          '_redirects',
          '# tweetable-paragraphs rewrite paths #\n',
        );
        redirectsFiledata = files['_redirects'];
      }
      redirectsFiledata.contents = Buffer.from(
        String(
          redirectsFiledata.contents,
        ).replace(/^# tweetable-paragraphs rewrite paths #$/m, () =>
          [
            `/${ASSETS_DIR}/:id/* /:splat?fragment=:id 301!`,
            ...redirectsSet,
            '/* fragment=:id /:splat#:id 301!',
          ].join('\n'),
        ),
      );
    },
  });
};
