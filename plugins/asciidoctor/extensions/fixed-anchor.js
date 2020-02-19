/**
 * @see https://asciidoctor.org/docs/user-manual/#anchordef
 * @see https://asciidoctor-docs.netlify.com/asciidoctor.js/extend/extensions/inline-macro-processor/
 */

const util = require('util');

const { wrapAttrValue } = require('./utils/html');

/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @see https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
const HTML_WS_REGEXP = /[\t\n\f\r ]+/g;

module.exports = registry => {
  registry.inlineMacro('anchor', function() {
    this.process((_, id) => {
      /** @see https://momdo.github.io/html/dom.html#the-id-attribute */
      if (id === '') throw new Error('id属性は空文字列を許可していません');
      if (HTML_WS_REGEXP.test(id))
        throw new Error(
          `id属性値にASCIIホワイトスペース文字を含めることはできません: ${util.inspect(
            id,
          )}`,
        );

      return `<a id=${wrapAttrValue(id)}></a>`;
    });
  });
};
