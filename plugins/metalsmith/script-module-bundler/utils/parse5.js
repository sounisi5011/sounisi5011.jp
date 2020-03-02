const htmlparser2Adapter = require('parse5-htmlparser2-tree-adapter');

function walk(node, { treeAdapter }, callback) {
  if (callback(node) === false) {
    return false;
  }
  for (const childNode of treeAdapter.getChildNodes(node)) {
    if (callback(childNode) === false) {
      return false;
    }
  }
}
exports.walk = walk;

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
    value && typeof value === 'object' && typeof value.nodeName === 'string'
  );
}

/**
 * @param {string} tagName
 * @param {Object.<string, string>|Map.<string, string>|Set.<string>|(Object.<string, string>|Map.<string, string>|Set.<string>)[]} attrs
 * @param {string|Object|(string|Object)[]} content
 * @param {string} namespaceURI
 */
exports.createElement = (
  tagName,
  attrs,
  content = null,
  namespaceURI = 'http://www.w3.org/1999/xhtml',
) => {
  const elem = htmlparser2Adapter.createElement(
    tagName,
    namespaceURI,
    Array.isArray(attrs) ? createElemAttrs(...attrs) : createElemAttrs(attrs),
  );
  const contentList = Array.isArray(content) ? content : [content];
  for (const content of contentList) {
    if (content) {
      if (isNode(content)) {
        htmlparser2Adapter.appendChild(elem, content);
      } else {
        htmlparser2Adapter.insertText(elem, String(content));
      }
    }
  }
  return elem;
};

/**
 * @param {Object} node
 * @returns {string}
 */
exports.getNodePath = node => {
  const pathList = [];
  while (node) {
    const { parentNode } = node;
    let nodeName = node.nodeName;
    if (parentNode) {
      nodeName += `[${parentNode.childNodes.indexOf(node)}]`;
    }
    pathList.unshift(nodeName);
    node = parentNode;
  }
  return pathList.join('/');
};

exports.getAttrMap = attrs => {
  /** @type {Map.<string, string>} */
  const map = new Map();
  for (const attr of attrs) {
    if (attr.namespace || attr.prefix || map.has(attr.name)) continue;
    map.set(attr.name, attr.value);
  }
  return map;
};

exports.appendChild = htmlparser2Adapter.appendChild;

exports.detachNode = htmlparser2Adapter.detachNode;
