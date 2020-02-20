/**
 * anchorをマクロとして再定義する。これにより、全角のコロンを含むid属性も処理できるようになる。また、不正なid属性値をエラー報告することが可能になる。
 * @see https://asciidoctor.org/docs/user-manual/#anchordef
 * @see https://asciidoctor-docs.netlify.com/asciidoctor.js/extend/extensions/inline-macro-processor/
 * @see https://github.com/jirutka/asciidoctor-html5s/blob/v0.2.0/data/templates/inline_anchor.html.slim
 * @see https://asciidoctor.github.io/asciidoctor.js/master/#extensionsprocessor
 */

const util = require('util');

/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @see https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
const HTML_WS_REGEXP = /[\t\n\f\r ]+/g;

module.exports = registry => {
  registry.inlineMacro('anchor', function() {
    this.process((parent, id) => {
      /** @see https://momdo.github.io/html/dom.html#the-id-attribute */
      if (id === '') throw new Error('id属性は空文字列を許可していません');
      if (HTML_WS_REGEXP.test(id))
        throw new Error(
          `id属性値にASCIIホワイトスペース文字を含めることはできません: ${util.inspect(
            id,
          )}`,
        );

      return this.createAnchor(parent, '', { id, type: 'ref' }).convert();
    });
  });
};
