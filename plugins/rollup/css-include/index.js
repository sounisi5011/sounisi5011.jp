const path = require('path');
const util = require('util');

const { createFilter } = require('@rollup/pluginutils');

const pkg = require('./package.json');
const { toJsValue, filename2urlPath, isSameOrSubPath } = require('./utils');

module.exports = (options = {}) => {
  const filter = createFilter(options.include || '**/*.css', options.exclude);
  /** @type {Map.<string, { inputFilepath: string, referenceId: string }>} */
  const cssOriginalFilepathMap = new Map();
  /** @type {WeakMap.<rollup.PluginContextMeta, { rootURL: string, outputOptions: rollup.OutputOptions }>} */
  const rootURLMap = new WeakMap();

  const useImportMeta = !(options.publicURL || options.publicPath);
  const importCssFullpath = path.resolve(
    __dirname,
    useImportMeta
      ? './assets/import-css-using-import-meta.mjs'
      : './assets/import-css.mjs',
  );
  /** @type {string} */
  let rootURLStr = '';
  if (!useImportMeta && options.publicURL) {
    const url = new URL(options.publicURL, 'https://example.com');
    url.search = url.hash = '';
    rootURLStr = options.publicURL.startsWith(url.protocol + '//')
      ? url.href
      : options.publicURL.startsWith('//')
      ? url.href.substring(url.protocol.length)
      : url.pathname;
  }

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
      cssOriginalFilepathMap.set(id, {
        inputFilepath: id,
        referenceId: cssReferenceId,
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

    /**
     * @param {Object} outputOptions
     * @see https://rollupjs.org/guide/en/#outputoptions
     */
    outputOptions(outputOptions) {
      if (!useImportMeta) {
        let rootURL = rootURLStr;
        if (!rootURL && options.publicPath) {
          const publicPath = path.resolve(
            outputOptions.dir,
            options.publicPath,
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
        rootURLMap.set(this.meta, { rootURL, outputOptions });
      }
      return null;
    },

    /**
     * @param {{chunkId: string, fileName: string, format: string, moduleId: string, referenceId: string, relativePath: string}} arg
     * @see https://rollupjs.org/guide/en/#resolvefileurl
     */
    resolveFileUrl({ fileName, format, moduleId, referenceId, relativePath }) {
      const cssData = cssOriginalFilepathMap.get(moduleId);
      if (cssData && cssData.referenceId === referenceId) {
        if (!useImportMeta) {
          const rootURLData = rootURLMap.get(this.meta);
          if (!rootURLData || rootURLData.outputOptions.format !== format) {
            throw new Error(
              `rollupに破壊的な変更が生じた可能性があります。コードを修正してください`,
            );
          }
          const { rootURL } = rootURLData;
          return toJsValue(
            rootURL.replace(/\/+$/, '') + filename2urlPath(fileName),
          );
        } else {
          /**
           * @see https://github.com/rollup/rollup/blob/v1.32.0/src/utils/defaultPlugin.ts#L114-L132
           */
          if (format === 'es') {
            return `${toJsValue(relativePath)}, import.meta.url`;
          } else if (format === 'system') {
            return `${toJsValue(relativePath)}, module.meta.url`;
          } else {
            throw new Error(`format '${format}' はサポートしていません`);
          }
        }
      }
      return null;
    },

    /**
     * @param {Object} outputOptions
     * @param {Object.<string, Object>} bundle
     * @see https://rollupjs.org/guide/en/#generatebundle
     */
    async generateBundle(outputOptions, bundle) {
      if (typeof options.cssConverter !== 'function') return;

      /*
       * 出力アセットファイルに対応する入力ファイルパスを取得する
       */
      /** @type {Map.<string, { inputFilepath: string }>} */
      const inputFileDataMap = new Map();
      for (const [, { inputFilepath, referenceId }] of cssOriginalFilepathMap) {
        try {
          const outputFilename = this.getFileName(referenceId);
          inputFileDataMap.set(outputFilename, { inputFilepath });
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !/\bUnable to get file name for unknown file\b/.test(error.message)
          ) {
            throw error;
          }
        }
      }

      /*
       * 変換対象の出力アセットファイルの情報を配列化
       */
      const convertList = Object.entries(bundle)
        .filter(([, chunkOrAsset]) => chunkOrAsset.type === 'asset')
        .map(([outputFilename, assetInfo]) => ({
          outputFilename,
          assetInfo,
          inputFileData: inputFileDataMap.get(outputFilename),
        }))
        .filter(({ inputFileData }) => inputFileData)
        .map(({ outputFilename, assetInfo, inputFileData }) => ({
          assetInfo,
          converterArgument: {
            inputFilepath: inputFileData.inputFilepath,
            outputFilepath: path.resolve(outputOptions.dir, outputFilename),
            source: assetInfo.source,
            rollupOutputOptions: outputOptions,
          },
        }));

      /*
       * 出力アセットファイルを変換する
       */
      for (const { assetInfo, converterArgument } of convertList) {
        const result = await options.cssConverter(converterArgument);

        if (typeof result === 'string' || Buffer.isBuffer(result)) {
          assetInfo.source = result;
          continue;
        }

        if (!(typeof result === 'object' && result)) continue;
        const { source, insertFiles } = result;
        if (typeof source === 'string' || Buffer.isBuffer(source)) {
          assetInfo.source = source;
        } else if (source !== undefined) {
          throw new TypeError(
            `cssConverter()オプションの返り値が誤っています。オブジェクトのsourceプロパティには、次のいずれかの値のみを含められます：文字列、Bufferオブジェクト、undefined`,
          );
        }

        if (!(typeof insertFiles === 'object' && insertFiles)) {
          if (insertFiles === undefined) continue;
          throw new TypeError(
            `cssConverter()オプションの返り値が誤っています。オブジェクトのinsertFilesプロパティには、次のいずれかの値のみを含められます：オブジェクト、undefined`,
          );
        }
        for (const [filepath, source] of Object.entries(insertFiles)) {
          const fileName = path.relative(
            outputOptions.dir,
            path.resolve(outputOptions.dir, filepath),
          );

          /**
           * 出力ディレクトリ外のパスは受け付けない
           * @see https://stackoverflow.com/a/45242825/4907315
           */
          if (
            !fileName ||
            fileName === '..' ||
            fileName.startsWith(`..${path.sep}`) ||
            path.isAbsolute(fileName)
          ) {
            throw new Error(
              `cssConverter()オプションの返り値が誤っています。insertFilesプロパティで指定可能なファイルパスはRollupの出力ディレクトリ内を示す必要があります`,
            );
          }
          /*
           * 重複するファイル名は受け付けない
           */
          if (Object.prototype.hasOwnProperty.call(bundle, fileName)) {
            throw new Error(
              `cssConverter()オプションの返り値が誤っています。insertFilesプロパティで指定されたファイルパスが既存のものと重複しています：'${fileName}'`,
            );
          }
          /*
           * 誤った型の内容は受け付けない
           */
          if (source === undefined) continue;
          if (typeof source !== 'string' && !Buffer.isBuffer(source)) {
            throw new TypeError(
              `cssConverter()オプションの返り値が誤っています。insertFilesプロパティで指定可能なファイルの値は次のいずれかのみです：文字列、Bufferオブジェクト、undefined`,
            );
          }

          bundle[fileName] = {
            type: 'asset',
            fileName,
            source,
          };
        }
      }
    },
  };
};
