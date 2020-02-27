const rollupCommonjs = require('@rollup/plugin-commonjs');
const rollupNodeResolve = require('@rollup/plugin-node-resolve');
const rollupCssInclude = require('@sounisi5011/rollup-plugin-css-include');
const rollupBabel = require('rollup-plugin-babel');
const { terser: rollupTerserMinify } = require('rollup-plugin-terser');

module.exports = ({ outputDir }) => (files, metalsmith) => ({
  output: {
    dir: outputDir,
    sourcemap: true,
  },
  plugins: [
    rollupNodeResolve(),
    rollupCommonjs(),
    rollupCssInclude({
      publicPath: metalsmith.destination(),
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
