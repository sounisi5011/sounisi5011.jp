/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @see https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
const HTML_WS_REGEXP = /[\t\n\f\r ]+/g;

/**
 * @param {*[]} list
 * @param {*} defaultValue
 */
function first(list, defaultValue) {
  if (list.length < 1 && arguments.length >= 2) {
    list.push(defaultValue);
  }
  return list[0];
}

/**
 * @param {*[]} list
 */
function last(list) {
  return list[list.length - 1];
}

/**
 * @abstract
 */
class AbstractDOMUtils {
  /**
   * @abstract
   * @param {Node} node
   * @returns {boolean}
   */
  isElementNode(node) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Node} node
   * @returns {boolean}
   */
  isTextNode(node) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Element} node
   * @returns {string}
   */
  getTagName(node) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Element} node
   * @param {string} attrName
   * @returns {string|null}
   */
  getAttribute(node, attrName) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Element} node
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttribute(node, attrName) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Text} node
   * @returns {string}
   */
  getTextNodeContent(node) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Element} node
   * @returns {Node[]}
   */
  childNodes(node) {
    throw new Error('must be implemented by subclass!');
  }

  /**
   * @abstract
   * @param {Element} node
   * @param {string} selectors
   * @returns {boolean}
   */
  matches(node, selectors) {
    throw new Error('must be implemented by subclass!');
  }
}
exports.AbstractDOMUtils = AbstractDOMUtils;

class Data {
  /**
   * @param {AbstractDOMUtils} domUtils
   * @param {Node|null} idNode
   * @param {string} rawText
   */
  constructor(domUtils, idNode, rawText = '') {
    /**
     * @private
     * @type {string|null}
     */
    this.__id = (idNode && domUtils.getAttribute(idNode, 'id')) || null;
    /**
     * @private
     */
    this.__idNode = idNode || null;
    /**
     * @private
     * @type {string}
     */
    this.__rawText = rawText;
    /**
     * @private
     * @type {string|null}
     */
    this.__text = rawText.replace(HTML_WS_REGEXP, ' ');
    /**
     * @private
     * @type {number}
     */
    this.__marginTop = -1;
    /**
     * @private
     * @type {number}
     */
    this.__marginBottom = -1;
  }

  /**
   * id属性値。存在しない場合はnull
   * @returns {string|null}
   */
  get id() {
    return this.__id;
  }

  /**
   * id属性に対応するDOMノード。存在しない場合はnull
   */
  get idNode() {
    return this.__idNode;
  }

  /**
   * 改行や空白文字を整形していない内容の文字列。pre要素内ではこれが使用される
   */
  get rawText() {
    return this.__rawText;
  }
  set rawText(value) {
    this.__rawText = String(value);
  }

  /**
   * 改行や空白文字が整形済の内容の文字列
   */
  get text() {
    return this.__text;
  }
  set text(value) {
    this.__text = String(value);
  }

  /**
   * この要素の上マージンの行数
   * @returns {number}
   */
  get marginTopLines() {
    return this.__marginTop;
  }
  set marginTopLines(value) {
    const valueNum = Number(value);
    if (!Number.isInteger(valueNum)) {
      throw new TypeError(`不正な値です：${JSON.stringify(value) || value}`);
    }
    this.__marginTop = Math.max(this.__marginTop, valueNum);
  }

  /**
   * この要素の下マージンの行数
   * @returns {number}
   */
  get marginBottomLines() {
    return this.__marginBottom;
  }
  set marginBottomLines(value) {
    const valueNum = Number(value);
    if (!Number.isInteger(valueNum)) {
      throw new TypeError(`不正な値です：${JSON.stringify(value) || value}`);
    }
    this.__marginBottom = Math.max(this.__marginBottom, valueNum);
  }
}

/**
 * @typedef {{ ignoreElemSelector?:string, convertHook?:Object.<string, function({ domNode:Node, domUtils:AbstractDOMUtils, textData:Data, childTextContent:string, childTextDataList:Data[] }):void> }} Options
 * @param {AbstractDOMUtils} domUtils
 * @param {Node|null} domNode
 * @param {Options} opts
 * @param {Node|null} prevIdNode
 */
function readTextContents(domUtils, domNode, opts = {}, prevIdNode = null) {
  const options = {
    ignoreElemSelector: 'style, script, template',
    convertHook: {},
    ...opts,
  };

  /** @type {Data[]} */
  let dataList = [];

  if (!domNode) return dataList;

  if (domUtils.isTextNode(domNode)) {
    dataList = [
      new Data(domUtils, prevIdNode, domUtils.getTextNodeContent(domNode)),
    ];
  } else if (domUtils.isElementNode(domNode)) {
    if (!domUtils.matches(domNode, options.ignoreElemSelector)) {
      let currentIdNode = domUtils.hasAttribute(domNode, 'id')
        ? domNode
        : prevIdNode;
      /**
       * @see https://chromium.googlesource.com/chromium/blink/+/master/Source/core/css/html.css
       * @see https://dxr.mozilla.org/mozilla-central/source/layout/style/res/html.css
       * @see http://trac.webkit.org/browser/trunk/Source/WebCore/css/html.css
       */
      const isPreElem = domUtils.matches(
        domNode,
        'pre, xmp, plaintext, listing, textarea',
      );
      const isPElem = domUtils.matches(
        domNode,
        'p, blockquote, figure, h1, h2, h3, h4, h5, h6, hr, ul, menu, dir, ol, dl, multicol, pre, xmp, plaintext, listing',
      );

      /** @type {Data[]} */
      const newDataList = domUtils.childNodes(domNode).reduce(
        (list, childNode) => {
          const data = readTextContents(
            domUtils,
            childNode,
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
          /** @type {Data} */
          const lastListItem = last(list);
          if (firstDataItem && lastListItem) {
            if (lastListItem.idNode === firstDataItem.idNode) {
              /*
               * 前後のマージンの数だけ空行を生成する
               */
              const marginLinesNumber = Math.max(
                lastListItem.marginBottomLines,
                firstDataItem.marginTopLines,
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
        currentIdNode ? [new Data(domUtils, currentIdNode)] : [],
      );

      /*
       * br要素の内容は改行にする
       */
      if (/^br$/i.test(domUtils.getTagName(domNode))) {
        const firstData = newDataList[0];
        if (firstData) {
          firstData.text = firstData.rawText = '\n';
        } else {
          newDataList.push(new Data(domUtils, currentIdNode, '\n'));
        }
      }

      /*
       * p要素の前後には、一行のマージンを追加する
       */
      if (isPElem) {
        const margin = 1;
        /** @type {Data} */
        const firstData = first(newDataList, new Data(domUtils, currentIdNode));
        /** @type {Data} */
        const lastData = last(newDataList);
        firstData.marginTopLines = margin;
        lastData.marginBottomLines = margin;
      }

      dataList = newDataList;
    }

    const textData = dataList[0];
    if (textData) {
      for (const [selectors, hookFn] of Object.entries(options.convertHook)) {
        if (domUtils.matches(domNode, selectors)) {
          hookFn({
            domNode,
            domUtils,
            textData,
            get childTextContent() {
              return dataList.map(({ rawText }) => rawText).join('');
            },
            childTextDataList: dataList,
          });
        }
      }
    }
  }

  return dataList;
}
exports.readTextContents = readTextContents;
