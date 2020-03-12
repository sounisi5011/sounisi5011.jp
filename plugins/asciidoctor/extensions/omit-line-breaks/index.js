/**
 * HTMLへの変換時に混入する余分な改行文字を削除する。
 * Note: この実装は、要素がインラインなのかブロックレベルなのかを区別せず、要素の前後に存在する全てのLF改行文字を削除する。
 *       記述文章が主に日本語であるため、この挙動が問題になるケースは少ないと考える。
 *       ただし、英文を改行するようなケースにおいては問題となる可能性があるため、必要であるならば`{sp}`を使用することで解決する。
 * @see https://asciidoctor-docs.netlify.com/asciidoctor.js/extend/extensions/postprocessor/
 */

const parse5 = require('parse5');
const defaultTreeAdapter = require('parse5/lib/tree-adapters/default');

/**
 * @see https://github.com/inikulin/parse5/blob/9c7556ed05e4ff4d884ab2447e27ce3817c42e79/packages/parse5/lib/tree-adapters/default.js#L173-L175
 */
function setTextNodeContent(textNode, value) {
  textNode.value = value;
}

function astConverter(node, { prevNode, nextNode } = {}) {
  if (defaultTreeAdapter.isTextNode(node)) {
    /*
     * テキストノードの前にノードが存在しない（すなわち、開きタグの直後のテキストノードである）場合は、
     * 先頭の改行文字を削除する。
     */
    if (!prevNode) {
      setTextNodeContent(
        node,
        defaultTreeAdapter.getTextNodeContent(node).replace(/^\n/, ''),
      );
    }
    /*
     * テキストノードの次にノードが存在しない（すなわち、閉じタグの直前のテキストノードである）場合は、
     * 末尾の改行文字を削除する。
     */
    if (!nextNode) {
      setTextNodeContent(
        node,
        defaultTreeAdapter.getTextNodeContent(node).replace(/\n$/, ''),
      );
    }
  } else if (defaultTreeAdapter.isElementNode(node)) {
    /*
     * 要素の前のテキストノード（すなわち、開きタグの直前のテキストノードである場合）は、
     * 末尾の改行文字を削除する。
     */
    if (prevNode && defaultTreeAdapter.isTextNode(prevNode)) {
      setTextNodeContent(
        prevNode,
        defaultTreeAdapter.getTextNodeContent(prevNode).replace(/\n$/, ''),
      );
    }
    /*
     * 要素の後のテキストノード（すなわち、閉じタグの直後のテキストノードである場合）は、
     * 先頭の改行文字を削除する。
     */
    if (nextNode && defaultTreeAdapter.isTextNode(nextNode)) {
      setTextNodeContent(
        nextNode,
        defaultTreeAdapter.getTextNodeContent(nextNode).replace(/^\n/, ''),
      );
    }
  }

  /*
   * pre要素の場合は、子孫要素を処理しない。
   */
  if (defaultTreeAdapter.getTagName(node) === 'pre') {
    return;
  }

  /*
   * 子孫要素が存在する場合は、再帰的に処理を行う。
   */
  const childNodes = defaultTreeAdapter.getChildNodes(node);
  if (childNodes) {
    for (const [index, childNode] of childNodes.entries()) {
      astConverter(childNode, {
        prevNode: childNodes[index - 1],
        nextNode: childNodes[index + 1],
      });
    }
  }
}

module.exports = registry => {
  registry.postprocessor(function() {
    this.process((_, output) => {
      const htmlAST = parse5.parseFragment(output);
      astConverter(htmlAST);
      return parse5.serialize(htmlAST);
    });
  });
};
