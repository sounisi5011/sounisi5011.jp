const CSSselect = require('css-select');
const { Parse5Adapter } = require('css-select-parse5-adapter');
const parse5Serializer = require('parse5/lib/serializer');
const defaultTreeAdapter = require('parse5/lib/tree-adapters/default');

module.exports = ({ treeAdapter = defaultTreeAdapter } = {}) => {
  const cssSelectAdapter = new Parse5Adapter(treeAdapter);

  /**
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/interface.md#getdocumentmode
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/lib/tree-adapters/default.js#L97-L99
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5-htmlparser2-tree-adapter/lib/index.js#L205-L207
   */
  function isDocumentNode(node) {
    // Note: この動作は仕様で保証されているものではないため、TreeAdapter次第では動作不良を起こす可能性がある
    return typeof treeAdapter.getDocumentMode(node) === 'string';
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
   */
  function getTextContent(node, { omitSelectors = null } = {}) {
    if (treeAdapter.isCommentNode(node)) {
      return treeAdapter.getCommentNodeContent(node);
    } else if (treeAdapter.isTextNode(node)) {
      return treeAdapter.getTextNodeContent(node);
    } else if (
      treeAdapter.isDocumentTypeNode(node) ||
      isDocumentNode(node) ||
      (omitSelectors &&
        treeAdapter.isElementNode(node) &&
        matches(node, omitSelectors))
    ) {
      return null;
    }

    const childNodeList = treeAdapter.getChildNodes(node);
    if (!Array.isArray(childNodeList)) {
      return null;
    }
    let textContent = '';
    for (const childNode of childNodeList) {
      if (treeAdapter.isCommentNode(childNode)) continue;
      textContent += getTextContent(childNode, { omitSelectors }) || '';
    }
    return textContent;
  }

  /**
   * @param {string} attrName
   * @returns {string|null}
   * @see https://dom.spec.whatwg.org/#dom-element-getattribute
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/interface.md#getattrlist
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/default/attribute.md
   */
  function getAttribute(node, attrName) {
    const foundAttr = treeAdapter
      .getAttrList(node)
      .find(
        ({ name, namespace, prefix }) =>
          name === attrName && !namespace && !prefix,
      );
    if (!foundAttr) return null;
    return foundAttr.value;
  }

  /**
   * @param {string} attrName
   * @param {string} value
   * @see https://dom.spec.whatwg.org/#dom-element-setattribute
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/interface.md#getattrlist
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/default/attribute.md
   */
  function setAttribute(node, attrName, value) {
    const attrList = treeAdapter.getAttrList(node);
    const foundAttr = attrList.find(
      ({ name, namespace, prefix }) =>
        name === attrName && !namespace && !prefix,
    );
    if (foundAttr) {
      if (treeAdapter === defaultTreeAdapter) {
        foundAttr.value = value;
      } else {
        throw new Error(
          'parse5組み込みの TreeAdapter 以外では、属性更新操作に対応していません',
        );
      }
    } else {
      treeAdapter.adoptAttributes(
        node,
        attrList.concat({ name: attrName, value }),
      );
    }
  }

  /**
   * @param {string} attrName
   * @returns {boolean}
   * @see https://dom.spec.whatwg.org/#dom-element-hasattribute
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/interface.md#getattrlist
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/docs/tree-adapter/default/attribute.md
   */
  function hasAttribute(node, attrName) {
    return treeAdapter
      .getAttrList(node)
      .some(
        ({ name, namespace, prefix }) =>
          name === attrName && !namespace && !prefix,
      );
  }

  function getNextNode(targetNode, parentNode = null) {
    if (!parentNode) parentNode = treeAdapter.getParentNode(targetNode);
    if (!parentNode) return null;
    const childNodeList = treeAdapter.getChildNodes(parentNode);
    const nodeIndex = childNodeList.indexOf(targetNode);
    if (nodeIndex < 0) return null;
    return childNodeList[nodeIndex + 1] || null;
  }

  /**
   * @param {string} selectors
   * @see https://dom.spec.whatwg.org/#dom-parentnode-queryselector
   */
  function querySelector(node, selectors) {
    return CSSselect.selectOne(selectors, node, { adapter: cssSelectAdapter });
  }

  /**
   * @param {string} selectors
   * @see https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall
   */
  function querySelectorAll(node, selectors) {
    return CSSselect.selectAll(selectors, node, { adapter: cssSelectAdapter });
  }

  /**
   * @param {string} selectors
   * @see https://dom.spec.whatwg.org/#dom-element-matches
   */
  function matches(node, selectors) {
    return CSSselect.is(node, selectors, { adapter: cssSelectAdapter });
  }

  function createElement(parentElem, tagName, attrObj = {}, childNodes = []) {
    const elemNode = treeAdapter.createElement(
      tagName,
      treeAdapter.getNamespaceURI(parentElem),
      Object.entries(attrObj)
        .filter(
          ([, value]) =>
            value === null || value === undefined || value === false,
        )
        .map(([name, value]) => ({
          name,
          value: value === true ? '' : String(value),
        })),
    );
    for (const childNodeOrText of Array.isArray(childNodes)
      ? childNodes
      : [childNodes]) {
      if (typeof childNodeOrText === 'object' && childNodeOrText) {
        treeAdapter.appendChild(elemNode, childNodeOrText);
      } else if (childNodeOrText !== null && childNodeOrText !== undefined) {
        treeAdapter.insertText(elemNode, String(childNodeOrText));
      }
    }
    return elemNode;
  }

  function _insertBefore(parentNode, newNodeList, targetNode) {
    if (!parentNode) {
      throw new Error('parentNodeを指定する必要があります');
    }
    if (!Array.isArray(newNodeList)) {
      newNodeList = [newNodeList];
    }
    if (
      targetNode &&
      !treeAdapter.getChildNodes(parentNode).includes(targetNode)
    ) {
      throw new Error('targetNodeはparentNodeの子ノードではありません');
    }

    if (targetNode) {
      for (const newNode of newNodeList) {
        treeAdapter.insertBefore(parentNode, newNode, targetNode);
      }
    } else {
      for (const newNode of newNodeList) {
        treeAdapter.appendChild(parentNode, newNode);
      }
    }
    return true;
  }

  function prependChild(parentNode, newNodeList) {
    _insertBefore(
      parentNode,
      newNodeList,
      treeAdapter.getFirstChild(parentNode),
    );
  }

  function insertBefore(targetNode, newNodeList, parentNode = null) {
    if (!targetNode) {
      throw new Error('targetNodeを指定する必要があります');
    }
    if (!parentNode) {
      parentNode = treeAdapter.getParentNode(targetNode);
      if (!parentNode) {
        throw new Error('targetNodeは親ノードを有していません');
      }
    }
    _insertBefore(parentNode, newNodeList, targetNode);
  }

  function insertAfter(targetNode, newNodeList, parentNode = null) {
    if (!targetNode) {
      throw new Error('targetNodeを指定する必要があります');
    }
    if (!parentNode) {
      parentNode = treeAdapter.getParentNode(targetNode);
      if (!parentNode) {
        throw new Error('targetNodeは親ノードを有していません');
      }
    }
    _insertBefore(parentNode, newNodeList, getNextNode(targetNode, parentNode));
  }

  /**
   * @param {string} attrValue
   * @returns {string}
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/lib/serializer/index.js#L103
   */
  function escapeAttrValue(attrValue) {
    return parse5Serializer.escapeString(attrValue, true);
  }

  return {
    getTextContent,
    getAttribute,
    setAttribute,
    hasAttribute,
    querySelector,
    querySelectorAll,
    matches,
    createElement,
    appendChild: treeAdapter.appendChild,
    prependChild,
    insertBefore,
    insertAfter,
    detachNode: treeAdapter.detachNode,
    getChildNodes: treeAdapter.getChildNodes,
    getTagName: treeAdapter.getTagName,
    getNamespaceURI: treeAdapter.getNamespaceURI,
    getTextNodeContent: treeAdapter.getTextNodeContent,
    isTextNode: treeAdapter.isTextNode,
    isElementNode: treeAdapter.isElementNode,
    escapeAttrValue,
  };
};
