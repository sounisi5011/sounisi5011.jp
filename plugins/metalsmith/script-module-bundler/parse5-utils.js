const {
  createElement,
  insertText,
  appendChild,
} = require('parse5/lib/tree-adapters/default');

/**
 * @param {Object.<string, string>|Map.<string, string>|Set.<string>} attrs
 * @returns {{name: string, value: string}[]}
 * @see https://github.com/inikulin/parse5/blob/master/packages/parse5/docs/tree-adapter/default/attribute.md
 */
function createAttrs(attrs) {
  if (attrs instanceof Set)
    return [...attrs].map(name => ({ name, value: '' }));
  return (attrs instanceof Map
    ? [...attrs]
    : Object.entries(attrs)
  ).map(([name, value]) => ({ name, value }));
}

function isNode(value) {
  return (
    value && typeof value === 'object' && typeof value.nodeName === 'string'
  );
}

/**
 * @param {string} tagName
 * @param {Object.<string, string>|Map.<string, string>|Set.<string>} attrs
 * @param {string|Object|(string|Object)[]} content
 * @param {string} namespaceURI
 */
exports.createElement = (
  tagName,
  attrs,
  content = null,
  namespaceURI = 'http://www.w3.org/1999/xhtml',
) => {
  const elem = createElement(tagName, namespaceURI, createAttrs(attrs));
  const contentList = Array.isArray(content) ? content : [content];
  for (const content of contentList) {
    if (content) {
      if (isNode(content)) {
        appendChild(elem, content);
      } else {
        insertText(elem, String(content));
      }
    }
  }
  return elem;
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

exports.appendChild = appendChild;

exports.removeChild = (parentNode, targetNode) => {
  if (targetNode.parentNode === parentNode) {
    parentNode.childNodes = parentNode.childNodes.filter(
      node => node !== targetNode,
    );
  }
};
