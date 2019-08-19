const path = require('path');
const util = require('util');

const debug = require('debug')(
  `metalsmith---${path.relative(process.cwd(), __filename)}`,
);
const cheerio = require('cheerio');
const multimatch = require('multimatch');
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
    ignoreElems: ['style', 'script', 'template'],
    pattern: '**/*.html',
    rootSelector: 'body',
    textContentsReplacer: ($elem, childTextDataList) => childTextDataList,
    ...opts,
  };

  return (files, metalsmith, done) => {
    const errorList = [];

    multimatch(Object.keys(files), options.pattern).forEach(filename => {
      debug(`processing file: ${util.inspect(filename)}`);
      const filedata = files[filename];

      let $;
      try {
        $ = cheerio.load(filedata.contents.toString());
      } catch (err) {
        return;
      }

      const newErrorList = [];
      let isUpdated = false;

      $(options.rootSelector).each((i, elem) => {
        const $root = $(elem);
        const dataList = readTextContents($, $root, {
          ignoreElems: options.ignoreElems,
          replacer: options.textContentsReplacer,
        });

        dataList.forEach(({ id, idNode, text }) => {
          if (idNode) {
            const tweet = twitter.parseTweet(text);

            if (!tweet.valid) {
              const lengthOutText = text.substring(tweet.validRangeEnd);
              newErrorList.push({
                filepath: `${filename}#${id}`,
                message: `テキストが長すぎます。以下のテキストを削除し、あと${
                  lengthOutText.length
                }文字減らしてください:\n\n${lengthOutText.replace(
                  /^/gm,
                  '  > ',
                )}`,
              });
              return;
            }

            $(idNode).attr('data-share-text', text);
            isUpdated = true;
          }
        });
      });

      if (newErrorList.length >= 1) {
        errorList.push(...newErrorList);
      } else {
        if (isUpdated) {
          filedata.contents = Buffer.from($.html());
          debug(`contents updated: ${util.inspect(filename)}`);
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
