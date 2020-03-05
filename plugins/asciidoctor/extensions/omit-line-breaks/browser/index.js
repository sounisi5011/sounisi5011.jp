const core = require('../core');

module.exports = core({
  parse(htmlStr) {
    return document.createRange().createContextualFragment(htmlStr);
  },
  serialize(node) {
    return (
      node.innerHTML ||
      [...node.childNodes]
        .map(childNode => childNode.outerHTML || childNode.nodeValue)
        .join('')
    );
  },
  isTextNode(node) {
    return node instanceof Text;
  },
  getTextNodeContent(textNode) {
    return textNode.nodeValue;
  },
  setTextNodeContent(textNode, value) {
    textNode.nodeValue = value;
  },
  isElemNode(node) {
    return node instanceof Element;
  },
  getTagName(elemNode) {
    const tagName = elemNode.tagName;
    return tagName && tagName.toLowerCase();
  },
  getChildNodes(node) {
    return node.childNodes;
  },
});
