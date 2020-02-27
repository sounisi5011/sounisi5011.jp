const path = require('path');
const util = require('util');

const { createFilter } = require('@rollup/pluginutils');
const escapeStringRegexp = require('escape-string-regexp');

const pkg = require('./package.json');
const { toJsValue, filename2urlPath, isSameOrSubPath } = require('./utils');

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
      let rootURL = options.publicURL;
      if (rootURL) {
        const url = new URL(rootURL, 'https://example.com');
        url.search = url.hash = '';
        rootURL = rootURL.startsWith(url.protocol + '//')
          ? url.href
          : rootURL.startsWith('//')
          ? url.href.substring(url.protocol.length)
          : url.pathname;
      } else {
        const publicPath = path.resolve(
          outputOptions.dir,
          options.publicPath || '.',
        );
        if (!isSameOrSubPath(publicPath, outputOptions.dir)) {
          throw new Error(
            `publicPathオプションの値は、Rollupの出力ディレクトリの親ディレクトリである必要があります:\n` +
              `  options.publicPath: ${util.inspect(options.publicPath)}\n` +
              `  Rollup output.dir: ${util.inspect(outputOptions.dir)}`,
          );
        }
        rootURL = filename2urlPath(
          path.relative(publicPath, outputOptions.dir),
        );
      }
      for (const { id, referenceId } of cssMap.values()) {
        const cssFileName = this.getFileName(referenceId);
        for (const chunkOrAsset of Object.values(bundle)) {
          if (chunkOrAsset.facadeModuleId !== id) continue;
          const chunk = chunkOrAsset;

          // TODO: SourceMapの更新も行う
          const cssURL =
            rootURL.replace(/\/+$/, '') + filename2urlPath(cssFileName);
          chunk.code = chunk.code.replace(
            new RegExp(`(["'])${escapeStringRegexp(referenceId)}\\1`, 'g'),
            () => toJsValue(cssURL),
          );
        }
      }
    },
  };
};
