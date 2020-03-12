const path = require('path');

const rollupCommonjs = require('@rollup/plugin-commonjs');
const rollupNodeResolve = require('@rollup/plugin-node-resolve');
const rollupCssInclude = require('@sounisi5011/rollup-plugin-css-include');
const cssnano = require('cssnano');
const postcss = require('postcss');
const rollupBabel = require('rollup-plugin-babel');
const rollupSass = require('rollup-plugin-sass');
const { terser: rollupTerserMinify } = require('rollup-plugin-terser');
const rollupWebWorkerLoader = require('rollup-plugin-web-worker-loader');

function path2url(filepath, basepath = '') {
  if (basepath) {
    filepath = path.relative(basepath, path.resolve(basepath, filepath));
  }
  const url = new URL('http://x.y');
  url.pathname = filepath;
  return url.pathname;
}

const postcssOptions = {
  /** @see https://github.com/postcss/postcss/blob/master/docs/source-maps.md */
  map: { inline: false },
};
const postcssMinify = postcss([cssnano]);

module.exports = ({ outputDir }) => (files, metalsmith) => isESModules => ({
  output: {
    dir: outputDir,
    sourcemap: true,
  },
  plugins: [
    rollupNodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    rollupCommonjs(),
    rollupCssInclude({
      publicPath: metalsmith.destination(),
      async cssConverter({ inputFilepath, outputFilepath, source }) {
        const result = await postcssMinify.process(source, {
          ...postcssOptions,
          from: inputFilepath,
          to: outputFilepath,
        });
        return {
          source: result.css,
          insertFiles: {
            [`${outputFilepath}.map`]: result.map
              ? result.map.toString()
              : undefined,
          },
        };
      },
    }),
    rollupSass(),
    rollupWebWorkerLoader({
      sourcemap: true,
      inline: false,
      loadPath: path2url(outputDir, metalsmith.destination()),
      skipPlugins: [
        '@sounisi5011/rollup-plugin-css-include',
        'babel',
        'terser',
      ],
    }),
    rollupBabel({
      exclude: 'node_modules/**',
      comments: false,
      presets: [
        isESModules
          ? ['@babel/preset-modules', {}]
          : [
              '@babel/preset-env',
              {
                corejs: 3,
                useBuiltIns: 'usage',
                exclude: [
                  /*
                   * IE11でcore-jsが定義するPromise.all内のiterateが動作しないため除外。
                   * Promiseのpolyfillはmetalsmith-script-module-bundlerが追加するため問題はない。
                   */
                  'es.promise',
                  /*
                   * iterateを使わないのでIE11の問題とは無関係だが、
                   * metalsmith-script-module-bundlerが追加するPromiseのpolyfillがサポート済みのため、
                   * 容量削減の目的で無効化。
                   */
                  'es.promise.finally',
                ],
              },
            ],
      ],
    }),
    rollupTerserMinify(),
  ],
});
