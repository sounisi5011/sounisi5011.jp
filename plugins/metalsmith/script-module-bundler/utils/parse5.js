const defaultTreeAdapter = require('parse5/lib/tree-adapters/default');

module.exports = ({ treeAdapter = defaultTreeAdapter } = {}) => {
  function walk(node, callback) {
    if (callback(node) === false) {
      return false;
    }
    for (const childNode of treeAdapter.getChildNodes(node) || []) {
      if (walk(childNode, callback) === false) {
        return false;
      }
    }
  }

  /**
   * @param {*} node
   * @param {*} tagName
   */
  function isElemNode(node, tagName = null) {
    if (!treeAdapter.isElementNode(node)) {
      return false;
    }
    if (!tagName) {
      return true;
    }
    return treeAdapter.getTagName(node) === tagName;
  }

  /**
   * @param {(Object.<string, string|null>|Map.<string, string|null>|Set.<string>)[]} attrsList
   * @returns {{name: string, value: string}[]}
   * @see https://github.com/inikulin/parse5/blob/master/packages/parse5/docs/tree-adapter/default/attribute.md
   */
  function createElemAttrs(...attrsList) {
    /** @type {Map.<string, string>} */
    const attrsMap = new Map();
    for (const attrs of attrsList) {
      if (attrs instanceof Set) {
        for (const name of attrs) {
          attrsMap.set(name, '');
        }
      } else {
        for (const [name, value] of attrs instanceof Map
          ? attrs
          : Object.entries(attrs)) {
          if (typeof value === 'string' || value) {
            attrsMap.set(name, value);
          } else {
            attrsMap.delete(name);
          }
        }
      }
    }
    return [...attrsMap].map(([name, value]) => ({ name, value }));
  }

  function isNode(value) {
    return (
      value && typeof value === 'object' && treeAdapter.isElementNode(value)
    );
  }

  /**
   * @param {string} tagName
   * @param {Object.<string, string>|Map.<string, string>|Set.<string>|(Object.<string, string>|Map.<string, string>|Set.<string>)[]} attrs
   * @param {string|Object|(string|Object)[]} content
   * @param {string} namespaceURI
   */
  function createElement(
    tagName,
    attrs,
    content = null,
    namespaceURI = 'http://www.w3.org/1999/xhtml',
  ) {
    const elem = treeAdapter.createElement(
      tagName,
      namespaceURI,
      Array.isArray(attrs) ? createElemAttrs(...attrs) : createElemAttrs(attrs),
    );
    const contentList = Array.isArray(content) ? content : [content];
    for (const content of contentList) {
      if (content) {
        if (isNode(content)) {
          treeAdapter.appendChild(elem, content);
        } else {
          treeAdapter.insertText(elem, String(content));
        }
      }
    }
    return elem;
  }

  /**
   * @param {Object} node
   * @returns {string}
   */
  function getNodePath(node) {
    const pathList = [];
    while (node) {
      const parentNode = treeAdapter.getParentNode(node);

      /**
       * @see https://github.com/inikulin/parse5/blob/master/packages/parse5/docs/tree-adapter/default/interface-list.md
       */
      let nodeName = node.nodeName;
      if (!nodeName) {
        if (treeAdapter.isElementNode(node)) {
          nodeName = treeAdapter.getTagName(node);
        } else if (treeAdapter.isTextNode(node)) {
          nodeName = '#text';
        } else if (treeAdapter.isCommentNode(node)) {
          nodeName = '#comment';
        } else if (treeAdapter.isDocumentTypeNode(node)) {
          nodeName = '#documentType';
        } else {
          /**
           * @see https://github.com/inikulin/parse5/blob/master/packages/parse5-htmlparser2-tree-adapter/docs/document.md
           * @see https://github.com/inikulin/parse5/blob/master/packages/parse5-htmlparser2-tree-adapter/docs/document-fragment.md
           */
          nodeName = `#${node.nodeType}`;
        }
      }

      if (parentNode) {
        const childNodeIndex = treeAdapter
          .getChildNodes(parentNode)
          .indexOf(node);
        nodeName += `[${childNodeIndex}]`;
      }
      pathList.unshift(nodeName);
      node = parentNode;
    }
    return pathList.join('/');
  }

  function getAttrMap(node) {
    /** @type {Map.<string, string>} */
    const map = new Map();
    for (const attr of treeAdapter.getAttrList(node)) {
      if (attr.namespace || attr.prefix || map.has(attr.name)) continue;
      map.set(attr.name, attr.value);
    }
    return map;
  }

  return {
    walk,
    isElemNode,
    createElement,
    getNodePath,
    getAttrMap,
    getParentNode: treeAdapter.getParentNode,
    appendChild: treeAdapter.appendChild,
    detachNode: treeAdapter.detachNode,
  };
};
