/**
 * @see https://asciidoctor-docs.netlify.com/asciidoctor.js/extend/extensions/inline-macro-processor/
 * @see https://github.com/asciidoctor/asciidoctor-extensions-lab/tree/master/lib/emoji-inline-macro
 * @see https://github.com/asciidoctor/asciidoctor.js/blob/master/packages/core/spec/share/extensions/emoji-inline-macro.js
 */

const { attrs2htmlText } = require('./utils/html');

module.exports = registry => {
  registry.inlineMacro('ruby', function() {
    this.positionalAttributes(['rubyText', 'rpStart', 'rpEnd']);
    this.process((_, target, attrs) => {
      const { rubyText } = attrs;
      let { rpStart = '', rpEnd = '' } = attrs;
      const rubyAttrsText = attrs2htmlText(
        Object.entries(attrs).filter(
          ([name]) => !/^(?:ruby|r[btp])/.test(name),
        ),
      );
      const rtAttrsText = attrs2htmlText(
        Object.entries(attrs)
          .filter(([name]) => /^rt-/.test(name))
          .map(([name, value]) => [name.replace(/^rt-/, ''), value]),
      );

      if (!rubyText) return target;
      if (!rpStart && !rpEnd) {
        rpStart = '（';
        rpEnd = '）';
      }
      return [
        `<ruby${rubyAttrsText}>`,
        `${target}`,
        `<rp>${rpStart}</rp>`,
        `<rt${rtAttrsText}>${rubyText}</rt>`,
        `<rp>${rpEnd}</rp>`,
        `</ruby>`,
      ].join('');
    });
  });
};
