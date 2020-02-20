/**
 * 連続した改行の代替となるスペース開けスタイル要素を挿入するマクロ
 * @see https://asciidoctor.org/docs/user-manual/#anchordef
 */

const { wrapAttrValue } = require('./utils/html');

module.exports = registry => {
  registry.inlineMacro('spacing', function() {
    this.process((_, lines) => {
      return [
        `<span class=${wrapAttrValue(`spacing-${lines}`)} aria-hidden="true">`,
        `</span>`,
      ].join('');
    });
  });
};
