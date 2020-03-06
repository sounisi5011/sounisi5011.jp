import getTextDataList from '@sounisi5011/html-id-split-text';
import twitter from 'twitter-text';

import { h, maxScroll, throttle, wrap } from '../utils/dom';
import asciidocExtensions from '../../../plugins/asciidoctor/extensions';
import html2textConfig from '../../../config/html2text';

const asciidoctor = window.Asciidoctor();

const registry = asciidoctor.Extensions.create();
for (const extension of asciidocExtensions) {
  if (typeof extension === 'function') {
    extension(registry);
  }
}

const asciidoctorOptions = {
  backend: 'html5s',
  attributes: {
    // @see https://asciidoctor.org/docs/user-manual/#front-matter-added-for-static-site-generators
    'skip-front-matter': '',
  },
  extension_registry: registry,
};

/**
 * @param {string} str
 * @returns {number}
 */
function unicodeLength(str) {
  return [...str].length;
}

/**
 * @param {string} str
 * @param {number} indexStart
 * @param {number} indexEnd
 * @returns {string}
 */
function unicodeSubstring(str, indexStart, indexEnd = undefined) {
  return [...str].slice(indexStart, indexEnd).join('');
}

/**
 * @param {string} tweetText
 * @param {string} suffixText
 * @returns {{ validText:string, validLength:number, invalidText:string }}
 */
function getInvalidTweetData(tweetText, suffixText = '') {
  const tweet = twitter.parseTweet(tweetText + suffixText);

  if (tweet.valid) {
    return null;
  }

  let validCodePointLength = Math.min(
    unicodeLength(tweetText) - 1,
    tweet.validRangeEnd,
  );
  while (validCodePointLength >= 0) {
    if (
      twitter.parseTweet(
        unicodeSubstring(tweetText, 0, validCodePointLength) + suffixText,
      ).valid
    ) {
      break;
    }
    validCodePointLength--;
  }

  const validText = unicodeSubstring(tweetText, 0, validCodePointLength);
  const validLength = validText.length;

  return {
    validText,
    validLength,
    invalidText: tweetText.substring(validLength),
  };
}

// ----- ----- ----- ----- ----- //

/*
 * contenteditable属性付き要素内での改行方法をdiv要素に指定。
 */
document.execCommand('DefaultParagraphSeparator', false, 'div');

const styleElem = h('style', [
  `
body {
  display: flex;
  height: 100vh;
  margin: 0;
}

.editor, .preview {
  flex: 1;
}

.editor {
  overflow-y: scroll;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  cursor: text;
  counter-reset: line-number;
}
.editor > div:before {
  counter-increment: line-number;
  content: counter(line-number);
}
`,
]);

const editorElem = h(
  'div',
  {
    className: 'editor',
    contentEditable: true,
    onPaste(event) {
      /**
       * 貼り付けられた文字列をプレーンテキストとして挿入する
       * @see https://stackoverflow.com/a/12028136/4907315
       */
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    },
    onInput: [
      throttle(
        event => event.currentTarget,
        elem => {
          let valueList = [];

          /*
           * 子要素が存在しない場合は空のdiv要素を追加する。
           * 1行目の行番号を正しく表示させるため。
           */
          if (elem.childNodes.length === 0) {
            elem.appendChild(h('div'));
          }
          elem.childNodes.forEach((node, _, childNodes) => {
            /*
             * 直下の空のdiv要素にはbr要素を挿入する。
             * 行番号を正しく表示させるため。
             */
            if (/^div$/i.test(node.tagName) && node.childNodes.length === 0) {
              node.appendChild(h('br'));
            }
            /*
             * 直下のテキストノード、または、一つのみのbr要素はdiv要素で囲む。
             * 行番号を正しく表示させるため。
             */
            if (
              node instanceof Text ||
              (/^br$/i.test(node.tagName) && childNodes.length === 1)
            ) {
              wrap(node, h('div'));
            }

            valueList.push(node.textContent);
          });

          /*
           * プレビューを更新
           */
          updatePreview(valueList.join('\n'));
        },
      ),
      { passive: true },
    ],
    onScroll: [
      throttle(event => event.currentTarget, scrollPreview),
      { passive: true },
    ],
  },
  [h('div', [h('br')])],
);

const previewElem = h('iframe', { className: 'preview' });
const previewStyleElem = h('style', [
  `
.novel-title:empty {
  opacity: 0.2;
}
.novel-title:empty:before {
  content: "No Title";
}
`,
]);

const novelTitleElem = h('h1', { className: 'novel-title' });
const novelBodyElem = h('main', { className: 'novel-body' });

function updatePreview(inputText) {
  /*
   * 入力内容が前と同じ場合は処理しない
   */
  if (prevInputText === inputText) return;
  prevInputText = inputText;

  const doc = asciidoctor.load(inputText, asciidoctorOptions);

  // @see https://asciidoctor-docs.netlify.com/asciidoctor.js/processor/extract-api/#get-the-document-title
  const title = doc.getDocumentTitle();
  novelTitleElem.innerHTML = title || '';

  const html = doc.convert();
  novelBodyElem.innerHTML = html;

  const dataList = getTextDataList(novelBodyElem, html2textConfig);
  console.log({
    dataList: dataList
      .map(data => [
        data,
        getInvalidTweetData(data.text, `\u{0020}https://example.com/`),
      ])
      .filter(([, invalidTweet]) => invalidTweet)
      .map(([{ id, idNode, text }, invalidTweet]) => ({
        id,
        idNode,
        text,
        ...invalidTweet,
      })),
  });
}
let prevInputText = null;

function scrollPreview(editorElem) {
  const previewScrollingElement = previewElem.contentDocument.scrollingElement;
  const editorScrollPct = editorElem.scrollTop / maxScroll(editorElem).top;

  previewScrollingElement.scrollTo(
    previewScrollingElement.scrollLeft,
    maxScroll(previewScrollingElement).top * editorScrollPct,
  );
}

document.head.appendChild(styleElem);

document.body.appendChild(editorElem);

document.body.appendChild(previewElem);
(previewDoc => {
  previewDoc.documentElement.lang = 'ja';
  for (const href of ['/default.css', '/novels.css']) {
    previewDoc.head.appendChild(h('link', { rel: 'stylesheet', href }));
  }
  previewDoc.head.appendChild(previewStyleElem);
  previewDoc.body.appendChild(novelTitleElem);
  previewDoc.body.appendChild(novelBodyElem);
})(previewElem.contentDocument);

updatePreview('');
