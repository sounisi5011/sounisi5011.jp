import getTextDataList from '@sounisi5011/html-id-split-text';
import twitter from 'twitter-text';

import {
  HTML_WS_REGEXP,
  h,
  insertText,
  maxScroll,
  removeChildren,
  saveText,
  throttle,
} from '../utils/dom';
import { parse as parseFrontMatter } from '../utils/front-matter';
import html2textConfig from '../../../config/html2text';
import { setterHook } from '../utils';

import asciidoctor, {
  createInlineMacroText,
  parseInlineMacroText,
} from './asciidoctor';

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

.editor .text-highlight .anchor-def .option {
  color: gray;
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
  flex-wrap: wrap;
  margin-top: -0.5em;
}

.editor .edit-menu .left-buttons {
  margin-left: -0.5em;
}

.editor .edit-menu .right-buttons {
  margin-left: 1em;
  margin-right: -0.5em;
}

.editor .edit-menu .left-buttons > *,
.editor .edit-menu .right-buttons > * {
  margin-top: 0.5em;
}

.editor .edit-menu .left-buttons > * {
  margin-left: 0.5em;
}

.editor .edit-menu .right-buttons > * {
  flex: 1 auto;
  margin-right: 0.5em;
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

.editor dialog.edit-ruby-prompt {
  top: 50%;
  transform: translate(0, -50%);
  border-radius: 0.5em;
  border: solid 1px #ccc;
  padding: 0;
}

.editor dialog.edit-ruby-prompt > form {
  padding: 1em;
}

.editor dialog.edit-ruby-prompt input[type=text] {
  border: solid 1px gray;
  padding: 0.5em;
}

.editor dialog.edit-ruby-prompt input[required]:valid {
  border-color: lime;
  outline-color: lime;
}

.editor dialog.edit-ruby-prompt input:invalid {
  border-color: red;
  outline-color: red;
}

.editor dialog.edit-ruby-prompt input[name^=rp] {
  min-width: 1em;
  width: 1em;
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
const { editorRubyPromptElem, showRubyPrompt } = (() => {
  function fitInputWidth(elem) {
    const { style } = elem;

    style.padding = 0;
    style.width = '1px';

    style.width = `${elem.scrollWidth}px`;

    style.removeProperty('padding');
  }

  /**
   * 開き括弧に対応する閉じ括弧文字を取得する
   * @param {string} openBracket 開き括弧の1文字。複数の文字を指定した場合は常に失敗する
   * @returns {string} 開き括弧に対応する閉じ括弧の1文字。対応する括弧が存在しないか、複数の文字を指定された場合は、空文字列を返す
   */
  function autocompleteCloseBracket(openBracket) {
    /**
     * @see https://unicode.org/Public/13.0.0/ucd/BidiBrackets.txt
     * @see https://ja.wikipedia.org/wiki/%E6%8B%AC%E5%BC%A7
     * @see https://en.wikipedia.org/wiki/Bracket#Encoding_in_digital_media
     */
    const openBracketsPattern = [
      { shift: -16, regexp: /^[\u00BB]$/ },
      { shift: -1, regexp: /^[\u298F]$/ },
      {
        shift: 1,
        regexp: /^[\u0028\u0F3A\u0F3C\u169B\u2018\u201C\u2039\u2045\u207D\u208D\u2308\u230A\u231C\u231E\u2329\u2768\u276A\u276C\u276E\u2770\u2772\u2774\u27C5\u27D3\u27E6\u27E8\u27EA\u27EC\u27EE\u2983\u2985\u2987\u2989\u298B\u298E\u2991\u2993\u2995\u2997\u29D8\u29DA\u29FC\u2E02\u2E04\u2E09\u2E0C\u2E1C\u2E22\u2E24\u2E26\u2E28\u3008\u300A\u300C\u300E\u3010\u3014\u3016\u3018\u301A\u301D\uFD3E\uFE59\uFE5B\uFE5D\uFF08\uFF5F\uFF62]$/,
      },
      { shift: 2, regexp: /^[\u003C\u005B\u007B\uFF1C\uFF3B\uFF5B]$/ },
      { shift: 3, regexp: /^[\u298D]$/ },
      { shift: 4, regexp: /^[\u201A]$/ },
      { shift: 16, regexp: /^[\u00AB]$/ },
    ];

    for (const { shift, regexp } of openBracketsPattern) {
      if (regexp.test(openBracket)) {
        return String.fromCodePoint(openBracket.codePointAt(0) + shift);
      }
    }

    return '';
  }

  let insertRubyText = '';

  /** @type {HTMLInputElement} */
  const rubyBodyInputElem = h('input', {
    type: 'text',
    name: 'rb',
    placeholder: '振り仮名',
    required: true,
    pattern: '^[^[]+$',
  });
  /** @type {HTMLInputElement} */
  const rubyTextInputElem = h('input', {
    type: 'text',
    name: 'rt',
    placeholder: 'ふりがな',
    required: true,
  });
  /** @type {HTMLInputElement} */
  const rubyStartParenthesisInputElem = h('input', {
    type: 'text',
    name: 'rp-start',
    placeholder: '（',
    onInput() {
      fitInputWidth(this);

      if (rubyEndParenthesisInputElem.dataset.protectValue === undefined) {
        const { value } = this;
        if (value === '') {
          rubyEndParenthesisInputElem.value = '';
        } else {
          const closeBracketChar = autocompleteCloseBracket(value);
          if (!closeBracketChar) return;
          rubyEndParenthesisInputElem.value = closeBracketChar;
        }
      }
    },
  });
  setterHook(rubyStartParenthesisInputElem, 'value', function() {
    fitInputWidth(this);
  });
  /** @type {HTMLInputElement} */
  const rubyEndParenthesisInputElem = h('input', {
    type: 'text',
    name: 'rp-end',
    placeholder: '）',
    onInput() {
      fitInputWidth(this);

      if (this.value !== '') {
        this.dataset.protectValue = '';
      } else {
        delete this.dataset.protectValue;
      }
    },
  });
  setterHook(rubyEndParenthesisInputElem, 'value', function() {
    fitInputWidth(this);
  });
  /** @type {HTMLDialogElement} */
  const editorRubyPromptElem = h(
    'dialog.edit-ruby-prompt',
    {
      onClick(event) {
        if (event.target === this) {
          this.close();
        }
      },
      onClose() {
        editorInputElem.focus();
        if (insertRubyText) {
          insertText(editorInputElem, insertRubyText);
          insertRubyText = '';
        }
      },
    },
    h(
      'form',
      {
        method: 'dialog',
        onSubmit() {
          insertRubyText = createInlineMacroText(
            'ruby',
            rubyBodyInputElem.value,
            [rubyTextInputElem.value],
            {
              rpStart: (rubyStartParenthesisInputElem.value || null),
              rpEnd: (rubyEndParenthesisInputElem.value || null),
            },
          );
        },
      },
      [
        h('fieldset', [h('legend', '対象文字列'), rubyBodyInputElem]),
        h('fieldset', [
          h('legend', 'ルビ'),
          rubyStartParenthesisInputElem,
          rubyTextInputElem,
          rubyEndParenthesisInputElem,
        ]),
        h('input', { type: 'submit', value: 'OK' }),
      ],
    ),
  );
  const showRubyPrompt = () => {
    const { selectionStart, selectionEnd } = editorInputElem;
    const selectedText = editorInputElem.value.substring(
      selectionStart,
      selectionEnd,
    );
    insertRubyText = '';

    /*
     * 選択範囲がrubyマクロの場合は解析結果を代入する
     */
    const rubyMacroData = parseInlineMacroText(selectedText, [
      'rubyText',
      'rpStart',
      'rpEnd',
    ]);
    if (rubyMacroData && rubyMacroData.macroName === 'ruby') {
      rubyBodyInputElem.value = rubyMacroData.target;
      rubyTextInputElem.value = rubyMacroData.attrs.rubyText || '';
      rubyStartParenthesisInputElem.value = rubyMacroData.attrs.rpStart || '';
      rubyEndParenthesisInputElem.value = rubyMacroData.attrs.rpEnd || '';
    } else {
      rubyBodyInputElem.value = selectedText;
      rubyTextInputElem.value = '';
      rubyStartParenthesisInputElem.value = '';
      rubyEndParenthesisInputElem.value = '';
    }

    editorRubyPromptElem.showModal();
  };
  return { editorRubyPromptElem, showRubyPrompt };
})();
const editorMenuElem = h('div.edit-menu', [
  h('div.left-buttons', [
    ...[
      [
        'button',
        '#ID',
        (selectedText, _, currentText, [selectionStart, selectionEnd]) => {
          const invalidBlockIdCharRegExp = /["#%,.]/;
          const invalidInlineIdCharRegExp = /["[]/;
          const invalidIdCharRegExp = new RegExp(
            invalidBlockIdCharRegExp.source +
              '|' +
              invalidInlineIdCharRegExp.source,
            'g',
          );
          if (!selectedText) {
            selectedText = prompt('挿入するIDを入力：');
            if (!selectedText) return;
            if (HTML_WS_REGEXP.test(selectedText)) {
              alert('IDにASCIIホワイトスペース文字を含めることはできません');
              return;
            }
            const invalidCharMatch = selectedText.match(invalidIdCharRegExp);
            if (invalidCharMatch) {
              alert(
                'IDに次の文字を含めることはできません：' +
                  [...new Set(invalidCharMatch)].join(' '),
              );
              return;
            }
          } else {
            if (HTML_WS_REGEXP.test(selectedText)) {
              alert(
                '選択範囲が無効です。IDにASCIIホワイトスペース文字を含めることはできません',
              );
              return;
            }
            const invalidCharMatch = selectedText.match(invalidIdCharRegExp);
            if (invalidCharMatch) {
              alert(
                '選択範囲が無効です。IDに次の文字を含めることはできません：' +
                  [...new Set(invalidCharMatch)].join(' '),
              );
              return;
            }
          }

          const prev2char = currentText.substring(
            Math.max(0, selectionStart - 2),
            selectionStart,
          );
          if (/(?:^|\n)$/.test(prev2char)) {
            /*
             * 直前が改行、または、文字列の始まりの場合
             */
            const nextChar = currentText.substring(
              selectionEnd,
              selectionEnd + 1,
            );
            if (nextChar === '\n' || nextChar === '') {
              /*
               * 直後が改行、または、空文字列（入力の終わり）の場合は、段落用アンカーを挿入する。
               */
              const insertFirstLF = /^[^\n]/.test(prev2char);
              const insertLastLF = nextChar === '';
              return (
                (insertFirstLF ? '\n' : '') +
                `[#${selectedText}]` +
                (insertLastLF ? '\n' : '')
              );
            } else {
              /*
               * 直後が改行ではない場合は、自身の位置は行の先頭。
               */
              const isInsert = selectionStart === selectionEnd;
              if (isInsert && /^\n*$/.test(prev2char)) {
                return `[#${selectedText}]\n`;
              } else {
                return `anchor:${selectedText}[]`;
              }
            }
          } else {
            /*
             * 直前が改行文字ではない場合
             */
            const next2char = currentText.substring(
              selectionEnd,
              selectionEnd + 2,
            );
            if (/^\n?[^\n]/.test(next2char)) {
              /*
               * 直後が改行ではないか、次の行が存在する場合は、インラインアンカーを挿入する。
               */
              return `anchor:${selectedText}[]`;
            } else {
              /*
               * 直後が改行、または、空文字列（入力の終わり）の場合は、新しい段落の開始に相当。
               * 段落用アンカーを挿入する。
               */
              const insertLastLF = next2char === '';
              return `\n\n[#${selectedText}]` + (insertLastLF ? '\n' : '');
            }
          }
        },
      ],
      [
        'button.em-ruby',
        '強調',
        (selectedText, select) => {
          if (selectedText === '') {
            const targetText = prompt('挿入する文字列を入力：');
            if (!targetText) return;
            return `__${targetText}__`;
          } else {
            return ['__', select(selectedText), '__'];
          }
        },
      ],
    ].map(([tagName, childNodes, insertFn]) =>
      h(
        tagName,
        {
          onClick() {
            editorInputElem.focus();
            insertText(editorInputElem, insertFn);
          },
        },
        childNodes,
      ),
    ),
    h(
      'button',
      {
        onClick() {
          editorInputElem.focus();
          showRubyPrompt();
        },
      },
      h('ruby', ['振り仮名', h('rt', 'ふりがな')]),
    ),
    ...['Undo', 'Redo']
      .map(label =>
        Array.isArray(label)
          ? label.concat(String(label[label.length - 1]).toLowerCase())
          : [label, label.toLowerCase()],
      )
      .map(([label, command]) =>
        h(
          'button',
          {
            onClick() {
              editorInputElem.focus();
              document.execCommand(command, false, null);
            },
          },
          label,
        ),
      ),
  ]),
  h('div.right-buttons', [
    h('button', 'ロード'),
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
  editorRubyPromptElem,
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
     * @type {{ pattern: RegExp|RegExp[], processor: ProcessorFn }[]}
     */
    const patternList = [
      /**
       * id属性指定
       * @see https://asciidoctor.org/docs/user-manual/#anchordef
       */
      {
        pattern: [
          /^(\[\[)((?![!-9])[^\t\n\f\r -,/;-@[-^`{-~]+)((?:,(?:(?!]](?:(?![\r\n])\s)*$).)+)?)(\]\](?:(?![\r\n])\s)*)$/my,
          /^(\[#)((?:(?!](?:(?![\r\n])\s)*$)[^\t\n\f\r "#%,.])+)((?:(?:\s*,\s*|\.)(?:(?!](?:(?![\r\n])\s)*$)[^#])*)?)(\](?:(?![\r\n])\s)*)$/my,
          /(anchor:)([^\t\n\f\r "[]+)(\[[^\]]*\])()/y,
        ],
        processor(match) {
          const [, prefix, id, option, suffix] = match;
          currentId = id;
          return h(
            'span.anchor-def',
            { dataset: { id } },
            option
              ? [prefix + id, h('span.option', option), suffix]
              : prefix + id + suffix,
          );
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
          let match;
          for (const regexp of Array.isArray(pattern) ? pattern : [pattern]) {
            regexp.lastIndex = currentIndex;
            match = regexp.exec(inputText);
            if (match) break;
          }
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
