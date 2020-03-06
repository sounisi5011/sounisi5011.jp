const CSSselect = require('css-select');
const { Parse5Adapter } = require('css-select-parse5-adapter');
const parse5 = require('parse5');

const { AbstractDOMUtils, readTextContents } = require('../main');

class DOMUtils extends AbstractDOMUtils {
  constructor({ treeAdapter }) {
    super();

    /**
     * @private
     */
    this.__treeAdapter = treeAdapter;
    /**
     * @private
     */
    this.__cssSelectAdapter = new Parse5Adapter(treeAdapter);
  }

  /**
   * @param {Node} node
   * @returns {boolean}
   */
  isElementNode(node) {
    return this.__treeAdapter.isElementNode(node);
  }

  /**
   * @param {Node} node
   * @returns {boolean}
   */
  isTextNode(node) {
    return this.__treeAdapter.isTextNode(node);
  }

  /**
   * @param {Element} node
   * @returns {string}
   */
  getTagName(node) {
    return this.__treeAdapter.getTagName(node);
  }

  /**
   * @param {Element} node
   * @param {string} attrName
   * @returns {string|null}
   */
  getAttribute(node, attrName) {
    const foundAttr = this.__treeAdapter
      .getAttrList(node)
      .find(
        ({ name, namespace, prefix }) =>
          name === attrName && !namespace && !prefix,
      );
    if (!foundAttr) return null;
    return foundAttr.value;
  }

  /**
   * @param {Element} node
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttribute(node, attrName) {
    return this.__treeAdapter
      .getAttrList(node)
      .some(
        ({ name, namespace, prefix }) =>
          name === attrName && !namespace && !prefix,
      );
  }

  /**
   * @param {Text} node
   * @returns {string}
   */
  getTextNodeContent(node) {
    return this.__treeAdapter.getTextNodeContent(node);
  }

  /**
   * @param {Element} node
   * @returns {Node[]}
   */
  childNodes(node) {
    return this.__treeAdapter.getChildNodes(node);
  }

  /**
   * @param {Element} node
   * @param {string} selectors
   * @returns {boolean}
   */
  matches(node, selectors) {
    return CSSselect.is(node, selectors, { adapter: this.__cssSelectAdapter });
  }
}

/**
 * @typedef {{ treeAdapter?:TreeAdapter, ignoreElemSelector?:string, convertHook?:Object.<string, function({ domNode:Node, domUtils:AbstractDOMUtils, childTextDataList:Data[] }):void> }} Options
 * @param {Node|string} parse5NodeOrHTMLStr
 * @param {Options} opts
 */
module.exports = (parse5NodeOrHTMLStr, opts = {}) => {
  let { treeAdapter, ...options } = opts;
  if (!treeAdapter) {
    treeAdapter = require('parse5/lib/tree-adapters/default');
  }
  const parse5Node =
    typeof parse5NodeOrHTMLStr === 'object' && parse5NodeOrHTMLStr
      ? parse5NodeOrHTMLStr
      : parse5.parseFragment(String(parse5NodeOrHTMLStr), { treeAdapter });
  return readTextContents(new DOMUtils({ treeAdapter }), parse5Node, options);
};
