const path = require('path');

const { createFilter } = require('@rollup/pluginutils');
const escapeStringRegexp = require('escape-string-regexp');

const pkg = require('./package.json');
const { toJsValue } = require('./utils');

module.exports = (options = {}) => {
  const filter = createFilter(options.include || '**/*.css', options.exclude);
  const cssMap = new Map();

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
      cssMap.set(id, { id, referenceId });
      return {
        code: [
          `import cssLoader from ${toJsValue(
            path.resolve(__dirname, './assets/import-css.mjs'),
          )};`,
          `export var load = cssLoader(${toJsValue(referenceId)});`,
        ].join('\n'),
        map: { mappings: '' },
      };
    },

    /**
     * @param {Object} outputOptions
     * @param {Object.<string, Object>} bundle
     * @see https://rollupjs.org/guide/en/#generatebundle
     */
    generateBundle(outputOptions, bundle) {
      for (const { id, referenceId } of cssMap.values()) {
        const cssFileName = this.getFileName(referenceId);
        for (const chunkOrAsset of Object.values(bundle)) {
          if (chunkOrAsset.facadeModuleId !== id) continue;
          const chunk = chunkOrAsset;
          // TODO: SourceMapの更新も行う
          chunk.code = chunk.code.replace(
            new RegExp(`(["'])${escapeStringRegexp(referenceId)}\\1`, 'g'),
            () => toJsValue(`/${cssFileName}`),
          );
        }
      }
    },
  };
};
