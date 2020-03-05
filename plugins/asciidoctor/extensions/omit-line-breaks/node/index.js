const parse5 = require('parse5');
const defaultTreeAdapter = require('parse5/lib/tree-adapters/default');

const core = require('../core');

module.exports = core({
  parse: parse5.parseFragment,
  serialize: parse5.serialize,
  isTextNode: defaultTreeAdapter.isTextNode,
  getTextNodeContent: defaultTreeAdapter.getTextNodeContent,
  /**
   * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/lib/tree-adapters/default.js#L173-L175
   */
  setTextNodeContent(textNode, value) {
    textNode.value = value;
  },
  isElemNode: defaultTreeAdapter.isElementNode,
  getTagName: defaultTreeAdapter.getTagName,
  getChildNodes: defaultTreeAdapter.getChildNodes,
});
