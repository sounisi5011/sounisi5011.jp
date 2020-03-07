import getTextDataList from '@sounisi5011/html-id-split-text';
import twitter from 'twitter-text';

import { h, maxScroll, removeChildren, throttle } from '../utils/dom';
import { parse as parseFrontMatter } from '../utils/front-matter';
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

/** @type {function():void} */
const initFnList = [];

/**
 * @see http://takuyakobayashi.id/blog/2019/02/09/4301
 */
const styleElem = h('style', [
  `
html, body {
  height: 100%;
}

body {
  margin: 0;
}

.editor, .preview {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.editor {
  overflow-y: hidden;
  position: relative;
}

.preview {
  position: absolute;
  top: 0;
  visibility: hidden;
}

.editor .text-highlight,
.editor textarea {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  box-sizing: border-box;
  overflow-y: scroll;
}

.editor .text-highlight .front-matter {
  opacity: 0.2;
}

.editor .text-highlight .anchor-def {
  color: blue;
}

.editor .text-highlight .inline-macro {
  color: orange;
}

.editor textarea {
  width: 100%;
  height: 100%;
  resize: none;
  border: none;
  color: transparent;
  background-color: transparent;
  caret-color: black;
}

@media (min-width: 610px) and (min-aspect-ratio: 4/3) {
  body {
    display: flex;
  }

  .editor, .preview {
    flex: 1;
  }

  .preview {
    position: static;
    visibility: visible;
  }
}
`,
]);
const invalidLengthStyleElem = h('style');

const editorTextHighlightElem = h('div', {
  className: 'text-highlight',
  // Note: 一部のテキスト（ex. イイイイイイイイイイイイ）の表示幅がずれる。
  //       CSSのuser-modifyプロパティによる影響だが、これは非標準のため、
  //       contenteditable属性を設定することで対処する。
  contentEditable: true,
});
const editorInputElem = h('textarea', {
  placeholder: 'AsciiDocを入力',
  onInput: [
    throttle(
      event => event.currentTarget,
      elem => {
        /*
         * 入力欄のシンタックスハイライトを更新
         */
        updateTextHighlight(elem.value);
        /*
         * プレビューを更新
         */
        updatePreview(elem.value);
      },
    ),
    { passive: true },
  ],
  onScroll: [
    throttle(
      event => event.currentTarget,
      elem => {
        scrollTextHighlight(elem);
        scrollPreview(elem);
      },
    ),
    { passive: true },
  ],
});
const editorElem = h(
  'div',
  {
    className: 'editor',
  },
  [editorTextHighlightElem, editorInputElem],
);

initFnList.push(() => {
  /*
   * 入力欄のスタイルをコピー
   * textarea要素のデフォルトCSSをコピーし、文字幅や表示間隔を合わせる。
   */
  const inputElemStyle = window.getComputedStyle(editorInputElem);
  [
    'margin',
    'border',
    'padding',
    'whiteSpace',
    'overflowWrap',
    'font',
    'textAlign',
  ].forEach(styleName => {
    editorTextHighlightElem.style[styleName] = inputElemStyle[styleName];
  });
});

/*
 * 入力欄のシンタックスハイライトを更新
 */
function updateTextHighlight(inputText) {
  const highlightTextDocFrag = document.createDocumentFragment();

  /*
   * frontMatterを挿入
   */
  {
    const { frontMatter, content } = parseFrontMatter(inputText);
    if (frontMatter) {
      highlightTextDocFrag.appendChild(
        h('span', { className: 'front-matter' }, [frontMatter]),
      );
    }
    inputText = content;
  }

  /*
   * 本文をパース
   */
  {
    /** @type {string} */
    let currentId = '';

    /**
     * @type {{ pattern: RegExp, processor(match:RegExpExecArray):Node|Node[] }[]}
     */
    const patternList = [
      /**
       * id属性指定
       * @see https://asciidoctor.org/docs/user-manual/#anchordef
       */
      {
        pattern: /^\[(?:\[([^\],\r\n]+)[^\]]*\]|#([^\].,\r\n]+)[^\]]*)\](?:(?![\r\n])\s)*$|anchor:([^[\r\n]+)\[[^\]]*\]/my,
        processor(match) {
          const matchText = match[0];
          const id = match[3] || match[2] || match[1];
          currentId = id;
          return h('span', { className: 'anchor-def', dataset: { id } }, [
            matchText,
          ]);
        },
      },
      /**
       * インラインマクロ
       * @see https://asciidoctor.org/docs/user-manual/#inline-macro-processor-example
       */
      {
        pattern: /[a-z]+:(?:[^[\r\n]+)\[[^\]]*\]/y,
        processor(match) {
          const matchText = match[0];
          return h('span', { className: 'inline-macro' }, [matchText]);
        },
      },
    ];

    let prevIndex = 0;
    for (
      let currentIndex = 0;
      currentIndex < inputText.length;
      currentIndex++
    ) {
      /** @type {{ processor(match:RegExpExecArray):Node|Node[], match:RegExpExecArray }|false} */
      let matchData = false;
      for (const { pattern, processor } of patternList) {
        pattern.lastIndex = currentIndex;
        const match = pattern.exec(inputText);
        if (match) {
          matchData = { processor, match };
          break;
        }
      }

      if (matchData) {
        const { processor, match } = matchData;
        const matchText = match[0];
        const prevText = inputText.substring(prevIndex, match.index);

        if (prevText) {
          highlightTextDocFrag.appendChild(
            h('span', { dataset: { prevId: currentId } }, prevText),
          );
        }

        /** @type {Node[]} */
        const newNodeList = [].concat(processor(match));
        newNodeList.forEach(newNode => {
          if (!newNode.dataset.id) {
            newNode.dataset.prevId = currentId;
          }
          highlightTextDocFrag.appendChild(newNode);
        });

        currentIndex = prevIndex = match.index + matchText.length;
      }
    }

    const lastText = inputText.substring(prevIndex);
    if (lastText) {
      highlightTextDocFrag.appendChild(
        h('span', { dataset: { prevId: currentId } }, lastText),
      );
    }
  }

  /*
   * 入力欄のテキストを反映
   */
  removeChildren(editorTextHighlightElem);
  editorTextHighlightElem.appendChild(highlightTextDocFrag);
}

/*
 * 入力欄のシンタックスハイライトをスクロール
 */
function scrollTextHighlight(editorElem) {
  editorTextHighlightElem.style.transform = `translateY(${-editorElem.scrollTop}px)`;
}

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

  /*
   * 長さが不正な文章をハイライトするCSSを挿入
   */
  const dataList = getTextDataList(novelBodyElem, html2textConfig);
  const invalidLengthSelector = dataList
    .map(data => [
      data,
      getInvalidTweetData(data.text, `\u{0020}https://example.com/`),
    ])
    .filter(([, invalidTweet]) => invalidTweet)
    .map(([{ id }]) => `[data-prev-id="${CSS.escape(id || '')}"]`)
    .join(',');
  invalidLengthStyleElem.textContent = invalidLengthSelector
    ? `${invalidLengthSelector} { background-color: #f88; }`
    : '';
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
document.head.appendChild(invalidLengthStyleElem);

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

/*
 * 初期化処理を実行
 */
initFnList.forEach(init => init());
