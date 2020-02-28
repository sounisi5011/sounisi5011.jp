const path = require('path');

const { createFilter } = require('@rollup/pluginutils');

const pkg = require('./package.json');
const { toJsValue } = require('./utils');

const importCssFullpath = path.resolve(__dirname, './assets/import-css.mjs');

module.exports = (options = {}) => {
  const filter = createFilter(options.include || '**/*.css', options.exclude);

  return {
    name: pkg.name,

    /**
     * @param {string} code
     * @param {string} id
     * @see https://rollupjs.org/guide/en/#transform
     */
    transform(code, id) {
      if (!filter(id)) return;

      /*
       * 対象のCSSをアセットファイルとして追加
       */
      const cssReferenceId = this.emitFile({
        type: 'asset',
        source: code,
        name: path.basename(id),
      });

      return {
        /**
         * RollupのファイルURL参照を使用してCSSファイルのパスを含める
         * Note: ファイルURL参照ではURLクラスを使用するため、古いブラウザではPolyfillが必要。
         *       しかし、ここで生成するコードはBabelなどで処理されず、@babel/preset-envもPolyfillを挿入しない。
         *       そのため、assets/import-css.mjsファイル内でURLクラスを使用しこの問題を解決する。
         * @see https://rollupjs.org/guide/en/#file-urls
         */
        code: [
          `import cssLoader from ${toJsValue(importCssFullpath)};`,
          `export var load = cssLoader(import.meta.ROLLUP_FILE_URL_${cssReferenceId});`,
        ].join('\n'),
        /**
         * SourceMapは生成できないため、空文字列を返す
         * @see https://rollupjs.org/guide/en/#source-code-transformations
         */
        map: { mappings: '' },
      };
    },
  };
};
