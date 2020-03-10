/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @see https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
export const HTML_WS_REGEXP = /[\t\n\f\r ]+/g;

export function setAttr(elem, attrs) {
  for (const [attrName, attrValue] of Object.entries(attrs)) {
    if (
      /^on[A-Z]/.test(attrName) &&
      (typeof attrValue === 'function' ||
        (Array.isArray(attrValue) && typeof attrValue[0] === 'function'))
    ) {
      const eventType = attrName.substring(2).toLowerCase();
      if (Array.isArray(attrValue)) {
        elem.addEventListener(eventType, ...attrValue);
      } else {
        elem.addEventListener(eventType, attrValue);
      }
    } else if (attrName in elem) {
      if (typeof attrValue === 'object' && attrValue) {
        Object.assign(elem[attrName], attrValue);
      } else {
        elem[attrName] = attrValue;
      }
    } else {
      if (attrValue === null || attrValue === undefined) {
        elem.removeAttribute(attrName);
      } else {
        elem.setAttribute(attrName, attrValue);
      }
    }
  }
  return elem;
}

export function h(tagName, attrs = {}, children = []) {
  if (!Array.isArray(children)) {
    children = [children];
  }
  if (
    typeof attrs !== 'object' ||
    !attrs ||
    Array.isArray(attrs) ||
    attrs instanceof Node
  ) {
    children = [].concat(attrs, children);
    attrs = {};
  }

  tagName = tagName.replace(/\.([^.]+)/g, (_, className) => {
    attrs.className = attrs.className
      ? `${String(attrs.className).trim()} ${className}`
      : className;
    return '';
  });

  const elem = document.createElement(tagName);
  setAttr(elem, attrs);
  children.forEach(childNode => {
    if (typeof childNode === 'function') {
      childNode = childNode(elem);
    }
    if (childNode !== undefined && childNode !== null) {
      elem.append(childNode);
    }
  });
  return elem;
}

/**
 * @param {Node} parentNode
 */
export function removeChildren(parentNode) {
  let firstChild;
  while ((firstChild = parentNode.firstChild)) {
    parentNode.removeChild(firstChild);
  }
}

/**
 * @param {Node} targetNode
 * @param {Element} wrapperElem
 * @see https://stackoverflow.com/a/57377341/4907315
 */
export function wrap(targetNode, wrapperElem) {
  const { parentNode } = targetNode;
  if (parentNode) {
    parentNode.insertBefore(wrapperElem, targetNode);
  }
  wrapperElem.appendChild(targetNode);
  return wrapperElem;
}

export function maxScroll(docOrElem) {
  if (docOrElem instanceof Document) {
    const scrollingElement = docOrElem.scrollingElement;
    return maxScroll(scrollingElement);
  }

  return {
    /**
     * @see https://qiita.com/sounisi5011/items/1a5a2410fce27ba6d8ae#%E5%8F%B3%E3%81%8B%E3%82%89%E3%81%AE%E3%82%B9%E3%82%AF%E3%83%AD%E3%83%BC%E3%83%AB%E9%87%8F
     */
    get left() {
      return docOrElem.scrollWidth - docOrElem.clientWidth;
    },
    /**
     * @see https://qiita.com/sounisi5011/items/1a5a2410fce27ba6d8ae#%E4%B8%8B%E3%81%8B%E3%82%89%E3%81%AE%E3%82%B9%E3%82%AF%E3%83%AD%E3%83%BC%E3%83%AB%E9%87%8F
     */
    get top() {
      return docOrElem.scrollHeight - docOrElem.clientHeight;
    },
  };
}

export function throttle(conv, fn = null) {
  if (!fn) {
    fn = conv;
    conv = (...args) => args;
  }

  let isRunning = false;
  let argsCache = [];

  const reqAnimateFn = () => {
    fn.apply(...argsCache);
    isRunning = false;
  };

  return function(...args) {
    argsCache = [this, [].concat(conv.apply(this, args))];
    if (!isRunning) {
      isRunning = true;
      requestAnimationFrame(reqAnimateFn);
    }
  };
}

/**
 * 入力欄に文字列を挿入する
 *
 * @typedef {{}} SelectTextRef
 * @typedef {string | SelectTextRef | [string] | [string, SelectTextRef] | [SelectTextRef, string] | [string, SelectTextRef, string] | false | null | undefined} InsertTextData
 * @typedef {function(string, function(string):SelectTextRef, string, [number, number]): InsertTextData} InsertTextCallback
 * @param {HTMLTextAreaElement|HTMLInputElement} textareaElem 対象の入力欄の要素ノード。input要素かtextarea要素
 * @param {string|InsertTextCallback} insertTextOrCallback 挿入する文字列。または、挿入文字列を生成する関数。
 *     関数の場合は、第一引数が選択済みの文字列で、第二引数が選択するテキストを指定するための関数（以下、select()と表記）、第三引数が現在入力されている文字列、第四引数が選択範囲の数値の配列。
 *     返り値には、挿入する文字列、select()の返り値、文字列とselect()の配列を指定する。
 *     false、null、またはundefinedを返した場合は、挿入処理を行わない。
 *     select()は、引数に選択する文字列を指定し、その返り値を生成関数の返り値に含める。
 *     選択する領域は一箇所のみ。複数指示された場合は、最初の位置が優先される。
 */
export function insertText(textareaElem, insertTextOrCallback) {
  const { selectionStart, selectionEnd, selectionDirection } = textareaElem;
  /** @type {SelectTextRef} */
  const selectObj = {};
  let selectText = '';

  /** @type {InsertTextData} */
  let insertTextData;
  if (typeof insertTextOrCallback !== 'function') {
    insertTextData = insertTextOrCallback;
  } else {
    const currentText = textareaElem.value;
    const selectedText = currentText.substring(selectionStart, selectionEnd);
    let selectTextDefined = false;
    const select = text => {
      text = String(text);

      /*
       * 選択する文字列が指定済みの場合は、最初の選択文字列を優先するため、与えられた文字列をそのまま返す。
       */
      if (selectTextDefined) {
        return text;
      }

      selectText = text;
      selectTextDefined = true;
      return selectObj;
    };

    insertTextData = insertTextOrCallback(selectedText, select, currentText, [
      selectionStart,
      selectionEnd,
    ]);
  }

  let prevText = '';
  let nextText = '';
  if (Array.isArray(insertTextData)) {
    let selectPosDetected = false;
    for (const data of insertTextData) {
      if (data === selectObj) {
        selectPosDetected = true;
      } else if (!selectPosDetected) {
        prevText += String(data);
      } else {
        nextText += String(data);
      }
    }
  } else if (
    insertTextData === false ||
    insertTextData === null ||
    insertTextData === undefined
  ) {
    return;
  } else if (insertTextData !== selectObj) {
    prevText = String(insertTextData);
  }

  /**
   * undo操作をサポートするため、document.execCommand()メソッドを使用して文字列を挿入する。
   * この手法は高速に実行され、またinputイベントも発火する。
   * @see https://github.com/fregante/insert-text-textarea
   */
  const insertText = prevText + selectText + nextText;
  textareaElem.focus();
  document.execCommand('insertText', false, insertText);

  /*
   * 文字列を選択する
   */
  const newSelectionStart = selectionStart + prevText.length;
  const newSelectionEnd = newSelectionStart + selectText.length;
  textareaElem.setSelectionRange(
    newSelectionStart,
    newSelectionEnd,
    selectionDirection,
  );
}

/**
 * @param {string} filename
 * @param {string} filedata
 */
export function saveText(filename, filedata) {
  const filedataBlob = new Blob([filedata], { type: 'text/plain' });
  const filedataBlobURL = URL.createObjectURL(filedataBlob);
  const aElem = h('a', {
    href: filedataBlobURL,
    download: filename,
  });
  aElem.click();

  /**
   * Note: setTimeout()を使用しなくてもChromeでは動作し、
   *       仕様書にも「Requests that were started before the url was revoked should still succeed」と記載があるが、
   *       念の為blob URLを開放する処理は10秒後に行う。
   * @see https://w3c.github.io/FileAPI/#dfn-revokeObjectURL
   */
  setTimeout(() => URL.revokeObjectURL(filedataBlobURL), 10 * 1000);
}
