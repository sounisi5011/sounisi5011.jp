const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');
const util = require('util');

const spawn = require('cross-spawn');
const logger = require('debug');
const pluginKit = require('metalsmith-plugin-kit');
const parse5 = require('parse5');
const strictUriEncode = require('strict-uri-encode');

const pkg = require('./package.json');
const parse5UtilsGenerator = require('./utils/parse5');
const QRCode = require('./utils/qr-code');
const debug = logger(pkg.name);

const parse5Utils = parse5UtilsGenerator();

let twitter;
try {
  twitter = require('twitter-text');
} catch (error) {
  if (!/^Cannot find module /.test(error.message)) throw error;

  const command = 'npm';
  const args = ['install', '--no-save', 'twitter-text@3.x'];
  console.error(
    [
      `>> ${pkg.name}@${pkg.version} ${__dirname}`,
      `>> ${command} ${args.join(' ')}`,
      '',
    ].join('\n'),
  );
  spawn.sync(command, args, { cwd: __dirname, stdio: 'inherit' });
  twitter = require('twitter-text');
}

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

function getURL(htmlAST) {
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

  const headElem = parse5Utils.querySelector(htmlAST, 'head');
  if (!headElem) return;

  for (const { query, attr } of metaElemDefs) {
    for (const matchNode of parse5Utils.querySelectorAll(headElem, query)) {
      const value = parse5Utils.getAttribute(matchNode, attr);
      if (typeof value === 'string' && /^https?:\/\//.test(value)) {
        return value;
      }
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

function createData(idNode, text = '') {
  const id = idNode && parse5Utils.getAttribute(idNode, 'id');
  return {
    id: id || null,
    idNode,
    margin: {
      bottom: -1,
      top: -1,
    },
    rawText: text,
    text: text.replace(HTML_WS_REGEXP, ' '),
  };
}

function readTextContents(elemNode, opts = {}, prevIdNode = null) {
  const options = {
    ignoreElems: ['style', 'script', 'template'],
    replacer: ({ node, parse5Utils }, dataList) => dataList,
    ...opts,
  };
  const ignoreElemSelector = options.ignoreElems.join(', ');

  let dataList = [];

  if (parse5Utils.isTextNode(elemNode)) {
    dataList = [
      createData(prevIdNode, parse5Utils.getTextNodeContent(elemNode)),
    ];
  } else if (
    parse5Utils.isElementNode(elemNode) &&
    !parse5Utils.matches(elemNode, ignoreElemSelector)
  ) {
    let currentIdNode = parse5Utils.hasAttribute(elemNode, 'id')
      ? elemNode
      : prevIdNode;
    /**
     * @see https://chromium.googlesource.com/chromium/blink/+/master/Source/core/css/html.css
     * @see https://dxr.mozilla.org/mozilla-central/source/layout/style/res/html.css
     * @see http://trac.webkit.org/browser/trunk/Source/WebCore/css/html.css
     */
    const isPreElem = parse5Utils.matches(
      elemNode,
      'pre, xmp, plaintext, listing, textarea',
    );
    const isPElem = parse5Utils.matches(
      elemNode,
      'p, blockquote, figure, h1, h2, h3, h4, h5, h6, hr, ul, menu, dir, ol, dl, multicol, pre, xmp, plaintext, listing',
    );

    const newDataList = parse5Utils.getChildNodes(elemNode).reduce(
      (list, childNode) => {
        const data = readTextContents(childNode, options, currentIdNode);

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
            const marginLines = '\n'.repeat(Math.max(0, 1 + marginLinesNumber));

            lastListItem.rawText += marginLines + firstDataItem.rawText;
            lastListItem.text += marginLines + firstDataItem.text;
            data.shift();
          }
        }

        return [...list, ...data];
      },
      currentIdNode ? [createData(currentIdNode)] : [],
    );

    /*
     * br要素の内容は改行にする
     */
    if (parse5Utils.getTagName(elemNode) === 'br') {
      const firstData = newDataList[0];
      if (firstData) {
        firstData.text = firstData.rawText = '\n';
      } else {
        newDataList.push(createData(currentIdNode, '\n'));
      }
    }

    /*
     * p要素の前後には、一行のマージンを追加する
     */
    if (isPElem) {
      const margin = 1;
      const firstData = first(newDataList, createData(currentIdNode));
      const lastData = last(newDataList);
      firstData.margin.top = Math.max(margin, firstData.margin.top);
      lastData.margin.bottom = Math.max(margin, lastData.margin.bottom);
    }

    dataList = newDataList;
  }

  return options.replacer({ node: elemNode, parse5Utils }, dataList);
}

module.exports = opts => {
  const options = Object.defineProperties(
    {
      filter: (filename, filedata, metalsmith, files) => true,
      generateFragmentPageURL: (url, id) => url + '#' + strictUriEncode(id),
      qrCodeBasePageURL: (url, { filename, filedata, files, metalsmith }) =>
        url,
      generateQRCodeURL: (url, { filename, filedata, files, metalsmith }) =>
        url,
      ignoreElems: ['style', 'script', 'template'],
      pattern: '**/*.html',
      rootSelector: 'body',
      textContentsReplacer: ({ node, parse5Utils }, childTextDataList) =>
        childTextDataList,
      allowWarning: true,
    },
    Object.getOwnPropertyDescriptors(opts),
  );

  const redirectsList = [];
  const warningList = [];
  /** @type {{filepath: string, message: string;}[][]} */
  const errorListList = [];

  return pluginKit.middleware({
    match: options.pattern,
    before() {
      redirectsList.length = 0;
      warningList.length = 0;
      errorListList.length = 0;
    },
    async each(filename, filedata, files, metalsmith) {
      if (!options.filter(filename, filedata, metalsmith, files)) {
        return;
      }

      debug(`processing file: ${util.inspect(filename)}`);

      const htmlAST = parse5.parse(filedata.contents.toString());

      const newErrorList = [];
      let isUpdated = false;
      const idList = [];

      const pageURL = getURL(htmlAST);
      if (!pageURL) {
        newErrorList.push({
          filepath: filename,
          message:
            'ページの絶対URLを取得できませんでした。OGPのmeta要素、正規URLを指定するlink要素、または、絶対URLが記述されたbase要素が必要です',
        });
      } else {
        parse5Utils
          .querySelectorAll(htmlAST, options.rootSelector)
          .forEach(rootElem => {
            const dataList = readTextContents(rootElem, {
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

              parse5Utils.setAttribute(
                idNode,
                'data-share-url',
                fragmentPageURL,
              );
              parse5Utils.setAttribute(idNode, 'data-share-text', text);

              idList.push({ fragmentPageURL, id });

              isUpdated = true;
            });

            parse5Utils
              .querySelectorAll(rootElem, options.ignoreElems.join(', '))
              .forEach(elem => {
                parse5Utils.setAttribute(elem, 'data-share-ignore', '');
              });
          });
      }

      if (newErrorList.length >= 1) {
        errorListList.push(newErrorList);
        return;
      }

      if (isUpdated) {
        filedata.contents = Buffer.from(parse5.serialize(htmlAST));
        debug(`contents updated: ${util.inspect(filename)}`);

        /**
         * @see https://developers.facebook.com/docs/sharing/best-practices#images
         */
        const ogpQrWidth = 400;
        /**
         * @see https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/summary
         */
        const twitterCardQrWidth = 144;

        const rootElemNode = parse5Utils.querySelector(htmlAST, ':root, html');
        const headElemNode = parse5Utils.querySelector(htmlAST, 'head');
        let refreshMetaElem;
        let ogpImageElem;
        const twitterCardImageElems = parse5Utils.querySelectorAll(
          headElemNode,
          'meta[name="twitter:image"]',
        );
        const twitterCardImageFound = Boolean(
          twitterCardImageElems.length >= 1 &&
            twitterCardImageElems.some(node =>
              parse5Utils.getAttribute(node, 'content'),
            ),
        );

        parse5Utils.setAttribute(rootElemNode, 'data-canonical-url', pageURL);

        for (const { id, fragmentPageURL } of idList) {
          parse5Utils.setAttribute(rootElemNode, 'data-jump-id', id);

          /**
           * クロールを禁止するrobotsメタタグを追加
           * @see https://developers.google.com/search/reference/robots_meta_tag?hl=ja
           */
          const metaRobotElemList = parse5Utils.querySelectorAll(
            headElemNode,
            'meta[name=robots]',
          );
          if (metaRobotElemList.length >= 1) {
            metaRobotElemList.forEach((metaElem, i) => {
              if (i === 0) {
                parse5Utils.setAttribute(metaElem, 'content', 'noindex');
              } else {
                parse5Utils.detachNode(metaElem);
              }
            });
          } else {
            parse5Utils.appendChild(
              headElemNode,
              parse5Utils.createElement(headElemNode, 'meta', {
                name: 'robots',
                content: 'noindex',
              }),
            );
          }

          /*
           * OGPタグのURLを上書き
           */
          parse5Utils
            .querySelectorAll(headElemNode, 'meta[property="og:url"]')
            .forEach((metaElem, i) => {
              if (i === 0) {
                parse5Utils.setAttribute(metaElem, 'content', fragmentPageURL);
              } else {
                parse5Utils.detachNode(metaElem);
              }
            });

          const encodedID = strictUriEncode(id);
          const [urlWithFragment, qrCodeUrlWithFragment] = [
            pageURL,
            options.qrCodeBasePageURL(pageURL, {
              filename,
              filedata,
              files,
              metalsmith,
            }),
          ].map(pageURL => pageURL + '#' + encodedID);
          const qrCodeURL = options.generateQRCodeURL(qrCodeUrlWithFragment, {
            filename,
            filedata,
            files,
            metalsmith,
          });
          const qrCodeBasename = sha1(qrCodeURL);

          /*
           * スクリプトが機能しない環境向けのリダイレクトタグを追加
           */
          if (!refreshMetaElem) {
            const metaElem = parse5Utils.createElement(headElemNode, 'meta', {
              'http-equiv': 'refresh',
            });
            const noscriptElem = parse5Utils.createElement(
              headElemNode,
              'noscript',
            );

            parse5Utils.appendChild(noscriptElem, metaElem);

            const charsetElem = parse5Utils.querySelector(
              headElemNode,
              'meta[charset]',
            );

            if (charsetElem) {
              parse5Utils.insertAfter(charsetElem, noscriptElem);
            } else {
              parse5Utils.prependChild(headElemNode, noscriptElem);
            }

            refreshMetaElem = metaElem;
          }
          parse5Utils.setAttribute(
            refreshMetaElem,
            'content',
            `0; url=${urlWithFragment}`,
          );

          await Promise.all(
            [
              async () => {
                /*
                 * OGPの画像に、QRコードを追加する
                 */

                if (!ogpImageElem) {
                  const insertedOgpImageElem = parse5Utils.querySelector(
                    headElemNode,
                    'meta[property="og:image"], meta[property^="og:image:"]',
                  );
                  if (!insertedOgpImageElem) return;

                  ogpImageElem = parse5Utils.createElement(
                    headElemNode,
                    'meta',
                    { property: 'og:image' },
                  );

                  parse5Utils.insertBefore(insertedOgpImageElem, [
                    ogpImageElem,
                    parse5Utils.createElement(headElemNode, 'meta', {
                      property: 'og:image:type',
                      content: 'image/png',
                    }),
                    parse5Utils.createElement(headElemNode, 'meta', {
                      property: 'og:image:width',
                      content: ogpQrWidth,
                    }),
                    parse5Utils.createElement(headElemNode, 'meta', {
                      property: 'og:image:height',
                      content: ogpQrWidth,
                    }),
                  ]);
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
                  await QRCode.toBuffer(qrCodeURL, {
                    type: 'png',
                    width: ogpQrWidth,
                  }),
                );
                debug(`file generated: ${util.inspect(qrFilename)}`);

                const qrFileURL = new URL(pageURL);
                qrFileURL.pathname = qrFilename;
                qrFileURL.search = '';
                qrFileURL.hash = '';

                parse5Utils.setAttribute(
                  ogpImageElem,
                  'content',
                  String(qrFileURL),
                );
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
                    await QRCode.toBuffer(qrCodeURL, {
                      type: 'png',
                      width: twitterCardQrWidth,
                    }),
                  );
                  debug(`file generated: ${util.inspect(qrFilename)}`);

                  const qrFileURL = new URL(pageURL);
                  qrFileURL.pathname = qrFilename;
                  qrFileURL.search = '';
                  qrFileURL.hash = '';

                  const twitterCardImageElem = parse5Utils.querySelector(
                    headElemNode,
                    'meta[name="twitter:image"]',
                  );
                  if (!twitterCardImageElem) {
                    const twitterCardImageElem = parse5Utils.createElement(
                      headElemNode,
                      'meta',
                      { name: 'twitter:image', content: String(qrFileURL) },
                    );
                    parse5Utils.appendChild(headElemNode, twitterCardImageElem);
                  } else {
                    parse5Utils.setAttribute(
                      twitterCardImageElem,
                      'content',
                      String(qrFileURL),
                    );
                  }
                }
              },
            ].map(fn => fn()),
          );

          /*
           * ファイルを生成
           */
          const newFilename = path.join(ASSETS_DIR, id, filename);
          pluginKit.addFile(files, newFilename, parse5.serialize(htmlAST));

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
          redirectsList.push(
            [
              ...new Set([
                `${filenameURL} fragment=${id} ${newFilenameURL} 200!`,
                [
                  filenameURL
                    .replace(/\/index.html$/, '')
                    .padEnd(filenameURL.length),
                  `fragment=${id}`,
                  newFilenameURL
                    .replace(/\/index.html$/, '')
                    .padEnd(newFilenameURL.length),
                  `200!`,
                ].join(' '),
              ]),
            ].join('\n'),
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
            ...redirectsList.sort(),
            '/* fragment=:id /:splat#:id 301!',
          ].join('\n'),
        ),
      );
    },
  });
};
