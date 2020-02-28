const rollupCommonjs = require('@rollup/plugin-commonjs');
const rollupNodeResolve = require('@rollup/plugin-node-resolve');
const rollupCssInclude = require('@sounisi5011/rollup-plugin-css-include');
const cssnano = require('cssnano');
const postcss = require('postcss');
const rollupBabel = require('rollup-plugin-babel');
const { terser: rollupTerserMinify } = require('rollup-plugin-terser');

const postcssOptions = {
  /** @see https://github.com/postcss/postcss/blob/master/docs/source-maps.md */
  map: { inline: false },
};
const postcssMinify = postcss([cssnano]);

module.exports = ({ outputDir }) => ({
  output: {
    dir: outputDir,
    sourcemap: true,
  },
  plugins: [
    rollupNodeResolve(),
    rollupCommonjs(),
    rollupCssInclude({
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
    rollupBabel({
      exclude: 'node_modules/**',
      comments: false,
      presets: [
        [
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
