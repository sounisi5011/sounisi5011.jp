import getTextDataList from '@sounisi5011/html-id-split-text';
import twitter from 'twitter-text';

import { h, maxScroll, removeChildren, saveText, throttle } from '../utils/dom';
import { parse as parseFrontMatter } from '../utils/front-matter';
import html2textConfig from '../../../config/html2text';

import asciidoctor from './asciidoctor';

const draftSaveKey = `draft-text::${location.pathname.replace(/\/+$/, '')}`;

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

const rootElem = document.documentElement;

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
  display: grid;
  grid-template-rows: auto max-content;
}

.show-preview .editor {
  display: none;
}

.preview {
  position: absolute;
  top: 0;
  visibility: hidden;
  border: none;
}

.show-preview .preview {
  visibility: visible;
}

.editor .text-highlight,
.editor textarea {
  box-sizing: border-box;
  overflow-y: scroll;
}

.editor .text-highlight {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: -1;
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

.editor .text-highlight .text-formatting {
  color: magenta;
}

.editor textarea {
  resize: none;
  border: none;
  color: transparent;
  background-color: transparent;
  caret-color: black;
}

.editor .text-highlight[hidden] + textarea {
  color: black;
  background-color: white;
}

.editor .edit-menu {
  display: flex;
  justify-content: space-between;
  border-top: solid 1px #ccc;
  padding: .75em;
  background-color: white;
}

.editor .edit-menu .left-buttons,
.editor .edit-menu .right-buttons {
  display: flex;
}

.editor .edit-menu .left-buttons {
  flex-wrap: wrap;
  margin-top: -0.5em;
  margin-left: -0.5em;
}

.editor .edit-menu .right-buttons {
  height: max-content;
  margin-left: 1em;
}

.editor .edit-menu .left-buttons > *,
.editor .edit-menu .right-buttons > * + * {
  margin-left: 0.5em;
}

.editor .edit-menu .left-buttons > * {
  margin-top: 0.5em;
}

.editor .edit-menu button {
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  border: solid 1px #ccc;
  white-space: nowrap;
  background-color: white;
}

.editor .edit-menu button.em-ruby {
  -webkit-text-emphasis: dot;
  text-emphasis: dot;
}

@media (min-width: 610px) and (min-aspect-ratio: 4/3) {
  body {
    display: flex;
  }

  .editor, .preview {
    flex: 1;
  }

  .show-preview .editor {
    display: grid;
  }

  .preview {
    position: static;
    visibility: visible;
  }

  .editor .edit-menu button.toggle-preview {
    display: none;
  }
}
`,
]);
const invalidLengthStyleElem = h('style');

const editorTextHighlightElem = h('div.text-highlight', {
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
         * 下書きデータを保存
         */
        localStorage.setItem(draftSaveKey, elem.value);
        /*
         * 入力欄のシンタックスハイライトを更新
         */
        updateTextHighlight(elem.value);
        /*
         * プレビューを更新
         */
        updatePreview(elem.value);
        /*
         * プレビューのスクロール量を更新
         * Note: frontMatterの有無でスクロール位置が変化するため、入力時にも更新する
         */
        scrollPreview(elem, true);
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
const editorMenuElem = h('div.edit-menu', [
  h('div.left-buttons', [
    h('button', '#ID'),
    h('button.em-ruby', '強調'),
    h('button', h('ruby', ['振り仮名', h('rt', 'ふりがな')])),
  ]),
  h('div.right-buttons', [
    h(
      'button',
      {
        onClick() {
          const titleDataList = getTextDataList(
            novelTitleElem,
            html2textConfig,
          );
          const titleText =
            titleDataList
              .map(data => data.text)
              .join('')
              .trim() || '無題';
          const inputText = editorInputElem.value;
          saveText(`${titleText}.adoc`, inputText);
        },
      },
      '保存',
    ),
    h(
      'button.toggle-preview',
      {
        onClick() {
          location.hash = 'preview';
        },
      },
      'プレビュー',
    ),
  ]),
]);
const editorElem = h('div.editor', [
  editorTextHighlightElem,
  editorInputElem,
  editorMenuElem,
]);

initFnList.push(
  () => {
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
  },
  () => {
    /*
     * 保存していた下書きデータを展開する
     */
    const draftSavedText = localStorage.getItem(draftSaveKey);
    if (draftSavedText) {
      /*
       * 入力欄の内容を更新
       */
      editorInputElem.value = draftSavedText;
      /*
       * 入力欄のシンタックスハイライトを更新
       */
      updateTextHighlight(draftSavedText);
      /*
       * プレビューを更新
       */
      updatePreview(draftSavedText);
    }
  },
);

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
      frontMatterElem = h('span.front-matter', frontMatter);
      highlightTextDocFrag.appendChild(frontMatterElem);
    } else {
      frontMatterElem = null;
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
     * @typedef {function(RegExpExecArray, function(string):(Node|string)[]): (string | Node | (string|Node)[])} ProcessorFn
     * @type {{ pattern: RegExp, processor: ProcessorFn }[]}
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
          return h('span.anchor-def', { dataset: { id } }, matchText);
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
          return h('span.inline-macro', matchText);
        },
      },
      /**
       * 斜体、太字、など
       * @see https://asciidoctor.org/docs/user-manual/#text-formatting
       */
      {
        pattern: /((?:\[(?:(?!\n\n)[^\]])+\])?(__|\*\*|##))((?:(?!\2|\n\n).)+)\2/sy,
        processor(match, process) {
          return h('span.text-formatting', [
            match[1],
            ...process(match[3]),
            match[2],
          ]);
        },
      },
    ];

    /**
     * @param {string} inputText
     * @returns {(Node|string)[]}
     */
    const process = (inputText, isRoot = true) => {
      /** @type {(Node|string)[]} */
      const nodeList = [];
      let prevIndex = 0;

      for (
        let currentIndex = 0;
        currentIndex < inputText.length;
        currentIndex++
      ) {
        /** @type {{ processor:ProcessorFn, match:RegExpExecArray }|false} */
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
            nodeList.push(
              isRoot
                ? h('span', { dataset: { prevId: currentId } }, prevText)
                : prevText,
            );
          }

          /** @type {(string|Node)[]} */
          const newNodeList = [].concat(
            processor(match, text => process(text, false)),
          );
          newNodeList.forEach(newNode => {
            if (isRoot) {
              if (newNode instanceof HTMLElement) {
                if (!newNode.dataset.id) {
                  newNode.dataset.prevId = currentId;
                }
              } else {
                newNode = h(
                  'span',
                  { dataset: { prevId: currentId } },
                  newNode,
                );
              }
            }
            nodeList.push(newNode);
          });

          currentIndex = prevIndex = match.index + matchText.length;
        }
      }

      const lastText = inputText.substring(prevIndex);
      if (lastText) {
        nodeList.push(
          isRoot
            ? h('span', { dataset: { prevId: currentId } }, lastText)
            : lastText,
        );
      }

      return nodeList;
    };

    highlightTextDocFrag.append(...process(inputText));
  }

  /*
   * 入力欄のテキストを反映
   */
  removeChildren(editorTextHighlightElem);
  editorTextHighlightElem.appendChild(highlightTextDocFrag);
}
/** @type {Element|null} */
let frontMatterElem = null;

/*
 * 入力欄のシンタックスハイライトをスクロール
 */
function scrollTextHighlight(editorElem) {
  editorTextHighlightElem.style.transform = `translateY(${-editorElem.scrollTop}px)`;
}

const previewElem = h('iframe.preview');
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

const novelTitleElem = h('h1.novel-title');
const novelBodyElem = h('main.novel-body');

function updatePreview(inputText) {
  /*
   * 入力内容が前と同じ場合は処理しない
   */
  if (prevInputText === inputText) return;
  prevInputText = inputText;

  editorTextHighlightElem.hidden = true;
  asciidoctor.convert(inputText);
}
let prevInputText = null;

asciidoctor.onProcessed(({ title, html }) => {
  novelTitleElem.innerHTML = title || '';
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
    .map(selector => `.editor .text-highlight ${selector}`)
    .join(',');
  invalidLengthStyleElem.textContent = invalidLengthSelector
    ? `${invalidLengthSelector} { background-color: #f88; }`
    : '';
  editorTextHighlightElem.hidden = false;
});

function scrollPreview(editorElem, inputUpdateOnly = false) {
  const previewScrollingElement = previewElem.contentDocument.scrollingElement;

  const existsFrontmatter = Boolean(frontMatterElem);
  if (inputUpdateOnly) {
    /*
     * 前回のスクロール処理の後に、Frontmatterの有無が変化しなかった場合は、処理を中断
     * Note: 未定義の非Boolean値とも比較するため、Booleanに変換した上で厳密等価の条件分岐を行う
     */
    if (existsFrontmatter === prevExistsFrontmatter) {
      prevExistsFrontmatter = existsFrontmatter;
      return;
    }
  }
  prevExistsFrontmatter = existsFrontmatter;

  const frontMatterHeight = frontMatterElem ? frontMatterElem.offsetHeight : 0;
  /*
   * エディタのスクロール量の比率を算出する。Frontmatterの高さは除外する。
   */
  const editorScrollPct =
    Math.max(0, editorElem.scrollTop - frontMatterHeight) /
    (maxScroll(editorElem).top - frontMatterHeight);

  previewScrollingElement.scrollTop =
    maxScroll(previewScrollingElement).top * editorScrollPct;
}
/**
 * 直前のスクロール処理時にFrontmatterが存在したか否かのフラグ
 * @type {boolean|null}
 */
let prevExistsFrontmatter = null;

/**
 * URLフラグメントの変更を検知しプレビューの表示を切り替える
 */
function togglePreview() {
  rootElem.classList.toggle('show-preview', location.hash === '#preview');
}

initFnList.push(togglePreview);

window.addEventListener('hashchange', togglePreview);

document.head.append(styleElem, invalidLengthStyleElem);
document.body.append(editorElem, previewElem);

(previewDoc => {
  previewDoc.documentElement.lang = 'ja';
  previewDoc.head.append(
    ...['/default.css', '/novels.css'].map(href =>
      h('link', { rel: 'stylesheet', href }),
    ),
    previewStyleElem,
  );
  previewDoc.body.append(novelTitleElem, novelBodyElem);
})(previewElem.contentDocument);

/*
 * 初期化処理を実行
 */
initFnList.forEach(init => init());
