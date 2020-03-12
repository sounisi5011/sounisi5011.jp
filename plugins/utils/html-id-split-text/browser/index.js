const { AbstractDOMUtils, readTextContents } = require('../main');

class DOMUtils extends AbstractDOMUtils {
  /**
   * @param {Node} node
   * @returns {boolean}
   */
  isElementNode(node) {
    return node instanceof Element;
  }

  /**
   * @param {Node} node
   * @returns {boolean}
   */
  isTextNode(node) {
    return node instanceof Text;
  }

  /**
   * @param {Element} node
   * @returns {string}
   */
  getTagName(node) {
    return node.tagName;
  }

  /**
   * @param {Element} node
   * @param {string} attrName
   * @returns {string|null}
   */
  getAttribute(node, attrName) {
    return node.getAttribute(attrName);
  }

  /**
   * @param {Element} node
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttribute(node, attrName) {
    return node.hasAttribute(attrName);
  }

  /**
   * @param {Text} node
   * @returns {string}
   */
  getTextNodeContent(node) {
    return node.nodeValue;
  }

  /**
   * @param {Element} node
   * @returns {Node[]}
   */
  childNodes(node) {
    return [...node.childNodes];
  }

  /**
   * @param {Element} node
   * @param {string} selectors
   * @returns {boolean}
   */
  matches(node, selectors) {
    return node.matches(selectors);
  }
}

/**
 * @typedef {{ ignoreElemSelector?:string, convertHook?:Object.<string, function({ domNode:Node, domUtils:AbstractDOMUtils, childTextDataList:Data[] }):void> }} Options
 * @param {Node|string} nodeOrHTMLStr
 * @param {Options} options
 */
module.exports = (nodeOrHTMLStr, options = {}) => {
  const node =
    nodeOrHTMLStr instanceof Node
      ? nodeOrHTMLStr
      : (() => {
          const elem = document.createElement('div');
          elem.insertAdjacentHTML('beforeend', nodeOrHTMLStr);
          return elem;
        })();
  return readTextContents(new DOMUtils(), node, options);
};
