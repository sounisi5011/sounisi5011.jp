const path = require('path');

const { createFilter } = require('@rollup/pluginutils');

const pkg = require('./package.json');
const { toJsValue } = require('./utils');

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
      const referenceId = this.emitFile({
        type: 'asset',
        source: code,
        name: path.basename(id),
      });
      /**
       * ファイルURL参照を使用してCSSファイルのパスを含める
       * @see https://rollupjs.org/guide/en/#file-urls
       */
      return {
        code: [
          `import cssLoader from ${toJsValue(
            path.resolve(__dirname, './assets/import-css.mjs'),
          )};`,
          `export var load = cssLoader(import.meta.ROLLUP_FILE_URL_${referenceId});`,
        ].join('\n'),
        map: { mappings: '' },
      };
    },
  };
};
