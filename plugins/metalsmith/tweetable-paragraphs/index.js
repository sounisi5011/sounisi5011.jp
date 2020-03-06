const crypto = require('crypto');
const path = require('path');
const { URL } = require('url');
const util = require('util');

const readTextContents = require('@sounisi5011/html-id-split-text');
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

function unicodeLength(str) {
  return [...str].length;
}

function unicodeSubstring(str, indexStart, indexEnd = undefined) {
  return [...str].slice(indexStart, indexEnd).join('');
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

  let validTweetLength = Math.min(
    unicodeLength(tweetText) - 1,
    tweet.validRangeEnd,
  );
  while (validTweetLength >= 0) {
    if (
      twitter.parseTweet(
        unicodeSubstring(tweetText, 0, validTweetLength) + suffixText,
      ).valid
    ) {
      break;
    }
    validTweetLength--;
  }

  return unicodeSubstring(tweetText, 0, validTweetLength).length;
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
      ignoreElemSelector: 'style, script, template',
      pattern: '**/*.html',
      rootSelector: 'body',
      textContentsReplacers: {},
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
              ignoreElemSelector: options.ignoreElemSelector,
              convertHook: options.textContentsReplacers,
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
              .querySelectorAll(rootElem, options.ignoreElemSelector)
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
        const htmlText = parse5.serialize(htmlAST);
        filedata.contents = Buffer.from(htmlText);
        debug(`contents updated: ${util.inspect(filename)}`);

        /**
         * @see https://developers.facebook.com/docs/sharing/best-practices#images
         */
        const ogpQrWidth = 400;
        /**
         * @see https://developer.twitter.com/en/docs/tweets/optimize-with-cards/overview/summary
         */
        const twitterCardQrWidth = 144;

        /*
         * 置換処理に用いるテンプレート文字列を生成
         */
        const { templateHTMLText, label } = (() => {
          const rootElemNode = parse5Utils.querySelector(
            htmlAST,
            ':root, html',
          );
          const headElemNode = parse5Utils.querySelector(htmlAST, 'head');

          /*
           * 置換用のランダム文字列を生成する
           */
          const replaceLabel = (() => {
            while (true) {
              const randStr = [
                '',
                ...[
                  Math.random(),
                  Math.random(),
                  Math.random(),
                  Math.random(),
                  Math.random(),
                ].map(n => n.toString(36).substring(2)),
                '',
              ].join('____');
              if (!htmlText.includes(randStr)) {
                return randStr;
              }
            }
          })();
          const label = {
            // id属性値の置換用ラベル
            id: `${replaceLabel}id____`,
            // fragmentクエリ付きURLの置換用ラベル
            fragmentPageURL: `${replaceLabel}fragmentPageURL____`,
            // ハッシュフラグメント付きURLの置換用ラベル
            pageURLandHashFrag: `${replaceLabel}pageURLandHashFrag____`,
          };

          /*
           * ルート要素にdata-*属性を追加
           */
          parse5Utils.setAttribute(rootElemNode, 'data-canonical-url', pageURL);
          parse5Utils.setAttribute(rootElemNode, 'data-jump-id', label.id);

          /*
           * スクリプトが機能しない環境向けのリダイレクトタグを追加
           */
          {
            const noscriptElem = parse5Utils.createElement(
              headElemNode,
              'noscript',
              {},
              parse5Utils.createElement(headElemNode, 'meta', {
                'http-equiv': 'refresh',
                content: `0; url=${label.pageURLandHashFrag}`,
              }),
            );

            const charsetElem = parse5Utils.querySelector(
              headElemNode,
              'meta[charset]',
            );
            if (charsetElem) {
              parse5Utils.insertAfter(charsetElem, noscriptElem);
            } else {
              parse5Utils.prependChild(headElemNode, noscriptElem);
            }
          }

          /**
           * クロールを禁止するrobotsメタタグを追加
           * @see https://developers.google.com/search/reference/robots_meta_tag?hl=ja
           */
          {
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
          }

          /*
           * OGPタグのURLを上書き
           */
          parse5Utils
            .querySelectorAll(headElemNode, 'meta[property="og:url"]')
            .forEach((metaElem, i) => {
              if (i === 0) {
                parse5Utils.setAttribute(
                  metaElem,
                  'content',
                  label.fragmentPageURL,
                );
              } else {
                parse5Utils.detachNode(metaElem);
              }
            });

          /*
           * OGP用画像のタグを追加
           */
          {
            const insertedOgpImageElem = parse5Utils.querySelector(
              headElemNode,
              'meta[property="og:image"], meta[property^="og:image:"]',
            );
            if (insertedOgpImageElem) {
              label.ogpImg = {
                url: `${replaceLabel}ogpImgURL____`,
              };

              parse5Utils.insertBefore(insertedOgpImageElem, [
                parse5Utils.createElement(headElemNode, 'meta', {
                  property: 'og:image',
                  content: label.ogpImg.url,
                }),
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
          }

          /*
           * Twitter Cardの画像が未定義の場合は、Twitter Card用画像のタグを追加
           */
          {
            const twitterCardImageElems = parse5Utils.querySelectorAll(
              headElemNode,
              'meta[name="twitter:image"]',
            );
            if (
              twitterCardImageElems.every(
                elem => !parse5Utils.getAttribute(elem, 'content'),
              )
            ) {
              label.twitterCardImg = {
                url: `${replaceLabel}twiCardImgURL____`,
              };
              if (twitterCardImageElems.length >= 1) {
                twitterCardImageElems.forEach((metaElem, i) => {
                  if (i === 0) {
                    parse5Utils.setAttribute(
                      metaElem,
                      'content',
                      label.twitterCardImg.url,
                    );
                  } else {
                    parse5Utils.detachNode(metaElem);
                  }
                });
              } else {
                const twitterCardImageElem = parse5Utils.createElement(
                  headElemNode,
                  'meta',
                  { name: 'twitter:image', content: label.twitterCardImg.url },
                );
                const insertedOgpOrTwitterCardImageElem = parse5Utils.querySelector(
                  headElemNode,
                  'meta[property^="twitter:"], meta[property^="og:"]',
                );
                if (insertedOgpOrTwitterCardImageElem) {
                  parse5Utils.insertAfter(
                    insertedOgpOrTwitterCardImageElem,
                    twitterCardImageElem,
                  );
                } else {
                  parse5Utils.appendChild(headElemNode, twitterCardImageElem);
                }
              }
            }
          }

          const templateHTMLText = parse5.serialize(htmlAST);
          return {
            templateHTMLText,
            label,
          };
        })();

        for (const { id, fragmentPageURL } of idList) {
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

          const [ogpImgURL, twitterCardImgURL] = await Promise.all(
            [
              async () => {
                if (!label.ogpImg) return;

                /*
                 * ページのURLを示すQRコードのファイル名を生成
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

                return qrFileURL.href;
              },
              async () => {
                if (!label.twitterCardImg) return;

                /*
                 * ページのURLを示すQRコードのファイル名を生成
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

                return qrFileURL.href;
              },
            ].map(fn => fn()),
          );

          /*
           * テンプレートHTMLを置換
           */
          const newFileHTMLText = [
            [label.id, id],
            [label.fragmentPageURL, fragmentPageURL],
            [label.pageURLandHashFrag, urlWithFragment],
            [label.ogpImg.url, ogpImgURL],
            [label.twitterCardImg.url, twitterCardImgURL],
          ].reduce((templateHTMLText, [label, attrValue]) => {
            if (label && attrValue) {
              return templateHTMLText.replace(
                new RegExp(label, 'g'),
                parse5Utils.escapeAttrValue(attrValue),
              );
            }
            return templateHTMLText;
          }, templateHTMLText);

          /*
           * ファイルを生成
           */
          const newFilename = path.join(ASSETS_DIR, id, filename);
          pluginKit.addFile(files, newFilename, newFileHTMLText);

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
