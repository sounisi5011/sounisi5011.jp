const path = require('path');
const util = require('util');

const debug = require('debug')(
  `metalsmith---${path.relative(process.cwd(), __filename)}`,
);
const cheerio = require('cheerio');
const pluginKit = require('metalsmith-plugin-kit');
const multimatch = require('multimatch');
const strictUriEncode = require('strict-uri-encode');
const twitter = require('twitter-text');

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
  const tweet = twitter.parseTweet(tweetText);

  if (tweet.valid) {
    return null;
  }

  let validTweetLength = tweet.validRangeEnd;
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
  const ignoreElemSelector = options.ignoreElems
    .map(nodeName => `:not(${String(nodeName).toLowerCase()})`)
    .join('');

  const $elem = $(elem);
  const dataList = [];

  $elem.each((i, node) => {
    const $node = $(node);

    if (node.type === 'text') {
      dataList.push(createData($, prevIdNode, node.data));
    } else if (node.type === 'tag' && $node.is(ignoreElemSelector)) {
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
  const options = {
    filter: (filename, filedata, metalsmith, files) => true,
    generateFragmentPageURL: (url, id) => url + '#' + strictUriEncode(id),
    ignoreElems: ['style', 'script', 'template'],
    pattern: '**/*.html',
    rootSelector: 'body',
    textContentsReplacer: ($elem, childTextDataList) => childTextDataList,
    ...opts,
  };

  return (files, metalsmith, done) => {
    const errorList = [];

    multimatch(Object.keys(files), options.pattern).forEach(filename => {
      const filedata = files[filename];
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

          dataList.forEach(({ id, idNode, text }) => {
            if (!idNode) {
              newErrorList.push({
                filepath: filename,
                message:
                  'id属性が割り当てられていない内容が存在します。id属性を追加し、全ての位置のハッシュフラグメントを提供してください',
              });
              return;
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

            $(idNode).attr('data-share-text', text);

            idList.push({ fragmentPageURL, id });

            isUpdated = true;
          });
        });
      }

      if (newErrorList.length >= 1) {
        errorList.push(...newErrorList);
      } else {
        if (isUpdated) {
          filedata.contents = Buffer.from($.html());
          debug(`contents updated: ${util.inspect(filename)}`);

          const $root = $(':root');
          const $head = $('head');

          $root.attr('data-canonical-url', pageURL);

          idList.forEach(({ id, fragmentPageURL }) => {
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
             * canonicalタグのURLを上書き
             */
            $head.find('link[rel=canonical]').each((i, elem) => {
              const $link = $(elem);
              if (i === 0) {
                $link.attr('href', fragmentPageURL);
              } else {
                $link.remove();
              }
            });

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

            /*
             * ファイルを生成
             */
            const newFilename = path.join('_fragment-anchors', id, filename);
            pluginKit.addFile(files, newFilename, $.html());

            /*
             * metalsmith-sitemapプラグインが生成するsitemap.xmlにファイルを含めない
             */
            files[newFilename].private = true;
          });
        }
      }
    });

    if (errorList.length >= 1) {
      done(
        new Error(
          [
            '以下のファイルでエラーが発生しました：',
            '',
            ...errorList.map(({ filepath, message }) =>
              `${filepath}: ${message}\n`.replace(/^(?=[^\r\n])/gm, '  '),
            ),
          ].join('\n'),
        ),
      );
    } else {
      done();
    }
  };
};
