/**
 * asciidoctor.jsがstrict modeで動作しない問題を修正する。
 *
 * asciidoctor.js v2.1.1は、ビルドに用いられているOpal 0.11.99.devのコードが原因でstrict mode時に実行エラーが生じる。
 * @see https://github.com/asciidoctor/asciidoctor.js/releases/tag/v2.1.1
 * @see https://github.com/opal/opal/blob/31d26d697ab7b75e78fbeb8d0d80739eeda715b5/opal/corelib/runtime.js#L1866
 *
 * 最新のmasterブランチのOpalでは修正済みのため、将来のasciidoctor.jsの更新により修正される可能性がある。
 * それまでは、このパッチ的な手製プラグインでどうにかする。
 * @see https://github.com/opal/opal/blob/bfe645a5327282558197b7fdb1e04f127bb1cd2d/opal/corelib/runtime.js#L1868-L1870
 */

const { createFilter } = require('@rollup/pluginutils');
const MagicString = require('magic-string');

const pkg = require('./package.json');

module.exports = () => {
  const filter = createFilter('**/node_modules/@asciidoctor/core/**/*.js');

  return {
    name: pkg.name,

    /**
     * @param {string} code
     * @param {string} id
     * @see https://rollupjs.org/guide/en/#transform
     */
    transform(code, id) {
      if (!filter(id)) return;

      const match = /(\b([a-z]+)\.displayName *= *[a-z]+;\n* *)\2\.length *= *([a-z]+\.length)\b/i.exec(
        code,
      );
      if (match) {
        const startIndex = match.index + match[1].length;
        const endIndex = match.index + match[0].length;
        const aliasFnName = match[2];
        const assignVarName = match[3];
        const replaceText = `Object.defineProperty(${aliasFnName},"length",{value:${assignVarName}})`;

        const s = new MagicString(code);
        s.overwrite(startIndex, endIndex, replaceText);

        const res = {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        };

        return res;
      }

      return null;
    },
  };
};
