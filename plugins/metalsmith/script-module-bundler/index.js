const path = require('path');

const fileExists = require('file-exists');
const isUrl = require('is-url');
const pluginKit = require('metalsmith-plugin-kit');
const { MultikeyMap } = require('multikey-map');
const parse5 = require('parse5');
const rollup = require('rollup');
const walkParse5 = require('walk-parse5');
const MIMEType = require('whatwg-mimetype');

const {
  getAttrMap,
  removeChild,
  appendChild,
  createElement,
  getNodePath,
  createElemAttrs,
  insertAfter,
} = require('./parse5-utils');
const {
  toJsValue,
  readFileAsync,
  minifyJS,
  isSameOrSubPath,
  addMetalsmithFile,
  toMetalsmithDestFilename,
  cmp,
} = require('./utils');

/**
 * @typedef {{ path: (function(): string), destination: (function(): string) }} Metalsmith
 * @typedef {Object.<string, MetalsmithFileData>} MetalsmithFiles
 * @typedef {{ contents: Buffer }} MetalsmithFileData
 * @typedef {{ nodeName: string, childNodes?: Parse5Node[] }} Parse5Node
 * @typedef {{ dir: string, sourcemap: boolean | 'inline' | 'hidden' }} RollupOutputOptions
 * @typedef {{ plugins: Object[], output: RollupOutputOptions }} RollupOptions
 * @typedef {{ type: 'chunk', code: string, dynamicImports: string[] }} ChunkInfo
 */

/**
 * @typedef {boolean} IsESModules
 * @param {{
 *          pattern: string | string[],
 *          jsDirectory: string,
 *          rollupOptions: (
 *            RollupOptions |
 *            function(MetalsmithFiles, Metalsmith): (
 *              (
 *                RollupOptions |
 *                function(IsESModules): RollupOptions | Promise.<RollupOptions>
 *              ) |
 *              Promise.<
 *                RollupOptions |
 *                function(IsESModules): RollupOptions | Promise.<RollupOptions>
 *              >
 *            )
 *          ),
 *          removePreload: boolean
 *        }} opts
 */
module.exports = opts => {
  const options = {
    pattern: ['**/*.html'],
    jsDirectory: '.',
    rollupOptions: {},
    removePreload: true,
    ...opts,
  };

  let jsRootDirPath = '';
  /** @type {Map.<string, {
   *           filedata: MetalsmithFileData,
   *           htmlAST: Parse5Node,
   *           scriptNodeMap: Map.<Parse5Node, {
   *             node: Parse5Node,
   *             attrs: Map.<string, string>,
   *             srcFullpath: string
   *           }[]>
   *        }>}
   */
  const targetFileMap = new Map();
  /** @type {Set.<string>} */
  const scriptFileFullpathSet = new Set();
  /**
   * @typedef {Map.<string, string | Buffer>} FilesMap
   * @typedef {Map.<string, {filepath: string, chunk: ChunkInfo, useDynamicImports: boolean}>} ChunkMap
   * @type {MultikeyMap.<[Metalsmith, MetalsmithFiles, string, string], {
   *          esm:    { outputOptions: RollupOutputOptions, filesMap: FilesMap, chunkMap: ChunkMap },
   *          system: { outputOptions: RollupOutputOptions, filesMap: FilesMap, chunkMap: ChunkMap }
   *       }>}
   */
  const bundleOutputCacheMap = new MultikeyMap();

  return pluginKit.middleware({
    match: options.pattern,
    before(files, metalsmith) {
      jsRootDirPath = metalsmith.path(options.jsDirectory);
      targetFileMap.clear();
      scriptFileFullpathSet.clear();
    },
    async each(filename, filedata, files, metalsmith) {
      /*
       * HTMLをパースし、ASTを作成する
       */
      const htmlAST = parse5.parse(filedata.contents.toString());

      /*
       * HTMLに含まれるscript要素を探す
       */
      walkParse5(htmlAST, targetNode => {
        if (targetNode.tagName !== 'script') return;

        const scriptElemNode = targetNode;
        const scriptElemAttrs = getAttrMap(scriptElemNode.attrs);

        /**
         * type属性値の値が以下に当てはまらない場合は処理しない
         * + 未定義
         * + 空文字列
         * + JSのMIMEタイプ
         * + "module"
         * @see https://html.spec.whatwg.org/multipage/scripting.html#attr-script-type
         */
        const type = scriptElemAttrs.get('type');
        if (type) {
          if (
            type !== 'module' &&
            !new MIMEType(type).isJavaScript({ allowParameters: true })
          ) {
            return;
          }
        }

        /**
         * src属性の値を検証
         */
        const src = scriptElemAttrs.get('src');
        // src属性が存在しない場合は処理しない
        if (!src) return;
        // src属性がURLの場合は処理しない
        if (isUrl(src)) return;
        // src属性が絶対パスでない場合は処理しない
        // TODO: 相対パスにも対応する
        if (!src.startsWith('/')) {
          throw new Error(
            `絶対パスではないJSパスは対応していません："${src}" in ${filename}`,
          );
        }

        /**
         * 非同期属性が無いものはスキップする
         * @see https://html.spec.whatwg.org/multipage/scripting.html#attr-script-async
         */
        if (
          type !== 'module' &&
          !scriptElemAttrs.has('defer') &&
          !scriptElemAttrs.has('async')
        ) {
          console.warn(
            `JSの同期実行はサポートしていません。Rollup.jsの変換対象から除外します："${src}" in ${filename}`,
          );
          return;
        }

        /*
         * src属性値から、JSファイルの絶対パスを導出する
         */
        const scriptFileFullpath = path.join(jsRootDirPath, src);
        scriptFileFullpathSet.add(scriptFileFullpath);

        /*
         * script要素の更新に必要な情報を追加
         */
        const targetFileData = targetFileMap.get(filename);
        if (!targetFileData) {
          targetFileMap.set(filename, {
            filedata,
            htmlAST,
            scriptNodeMap: new Map([
              [
                scriptElemNode.parentNode,
                [
                  {
                    node: scriptElemNode,
                    attrs: scriptElemAttrs,
                    srcFullpath: scriptFileFullpath,
                  },
                ],
              ],
            ]),
          });
        } else {
          const { scriptNodeMap } = targetFileData;
          const scriptNodeList = scriptNodeMap.get(scriptElemNode.parentNode);
          if (scriptNodeList) {
            scriptNodeList.push({
              node: scriptElemNode,
              attrs: scriptElemAttrs,
              srcFullpath: scriptFileFullpath,
            });
          } else {
            scriptNodeMap.set(scriptElemNode.parentNode, [
              {
                node: scriptElemNode,
                attrs: scriptElemAttrs,
                srcFullpath: scriptFileFullpath,
              },
            ]);
          }
        }
      });
    },
    async after(files, metalsmith) {
      /*
       * バンドル結果のキャッシュ用のキーを生成する
       */
      const buildID = JSON.stringify(
        [...targetFileMap]
          .sort(([a], [b]) => cmp(a, b))
          .reduce(
            (obj, [filename, { scriptNodeMap }]) => ({
              ...obj,
              [filename]: [...scriptNodeMap]
                .map(([parentNode, scriptNodeList]) => [
                  getNodePath(parentNode),
                  scriptNodeList,
                ])
                .sort(([a], [b]) => cmp(a, b))
                .reduce(
                  (obj, [parentNodePath, scriptNodeList]) => ({
                    ...obj,
                    [parentNodePath]: scriptNodeList
                      .map(({ srcFullpath }) => srcFullpath)
                      .sort(),
                  }),
                  {},
                ),
            }),
            {},
          ),
      );

      const metalsmithDestDir = metalsmith.destination();
      let bundleOutputCache = bundleOutputCacheMap.get([
        metalsmith,
        files,
        metalsmithDestDir,
        buildID,
      ]);

      if (!bundleOutputCache) {
        /*
         * Rollupのオプションを生成する
         */
        const rollupOptionsGenerator =
          typeof options.rollupOptions === 'function'
            ? await options.rollupOptions(files, metalsmith)
            : options.rollupOptions;

        /**
         * RollupのinputOptionsに必要なentryRecordを生成する
         * @see https://rollupjs.org/guide/en/#inputoptions-object
         */
        /** @type {Object.<string, string>} */
        const entryRecord = {};
        for (const scriptFileFullpath of scriptFileFullpathSet) {
          // Note: 本来は、このように事前にファイルの存在を検証するべきではない。処理開始までの間にファイルが削除される可能性が存在するため。
          // TODO: rollup内での処理時にファイルの存在判定を行い、除外する
          if (!(await fileExists(scriptFileFullpath))) continue;
          const entryName = path
            .relative(jsRootDirPath, scriptFileFullpath)
            .replace(/\.m?js$/, '');
          entryRecord[entryName] = scriptFileFullpath;
        }

        bundleOutputCache = {};
        let generatedRollupData;
        for (const { isESModules, ...rollupOutputOpts } of [
          // ES module用
          {
            isESModules: true,
            entryFileNames: '[name].mjs',
            chunkFileNames: '[name]-[hash].mjs',
            format: 'esm',
          },
          // SystemJS用
          {
            isESModules: false,
            entryFileNames: '[name].system.js',
            chunkFileNames: '[name]-[hash].system.js',
            format: 'system',
          },
        ]) {
          if (
            !generatedRollupData ||
            typeof rollupOptionsGenerator === 'function'
          ) {
            const { output: rollupOutputOptions, ...rollupInputOptions } =
              typeof rollupOptionsGenerator === 'function'
                ? await rollupOptionsGenerator(isESModules)
                : rollupOptionsGenerator;

            /**
             * RollupのinputOptionsを生成する
             * @see https://rollupjs.org/guide/en/#inputoptions-object
             */
            const inputOptions = {
              ...rollupInputOptions,
              input: entryRecord,
            };

            /*
             * Rollupのバンドルを生成する
             */
            const bundle = await rollup.rollup(inputOptions);

            /**
             * RollupのoutputOptionsを生成する
             * @see https://rollupjs.org/guide/en/#outputoptions-object
             */
            const rollupOutputOptsBase = {
              ...rollupOutputOptions,
              dir: path.resolve(
                metalsmithDestDir,
                rollupOutputOptions.dir || '.',
              ),
            };
            if (!isSameOrSubPath(metalsmithDestDir, rollupOutputOptsBase.dir)) {
              throw new Error(
                `rollupOptions.output.dirに指定するパスは、Metalsmithの出力ディレクトリ以下のパスでなければなりません：${rollupOutputOptsBase.dir}`,
              );
            }

            generatedRollupData = { bundle, rollupOutputOptsBase };
          }

          const { bundle, rollupOutputOptsBase } = generatedRollupData;

          /*
           * RollupでJSをビルドする
           */
          const outputOptions = {
            ...rollupOutputOptsBase,
            ...rollupOutputOpts,
          };
          const { output } = await bundle.generate(outputOptions);
          /** @type {FilesMap} */
          const filesMap = new Map();
          /** @type {ChunkMap} */
          const chunkMap = new Map();

          /** @type {Map<string, Object[]>} */
          const chunkOrAssetMap = output.reduce(
            (map, chunkOrAsset) =>
              map.set(
                chunkOrAsset.fileName,
                (map.get(chunkOrAsset.fileName) || []).concat(chunkOrAsset),
              ),
            new Map(),
          );

          for (const chunkOrAsset of output) {
            const filepath = path.resolve(
              outputOptions.dir,
              chunkOrAsset.fileName,
            );
            if (chunkOrAsset.type === 'asset') {
              const asset = chunkOrAsset;
              filesMap.set(filepath, asset.source);
            } else {
              const chunk = chunkOrAsset;
              let { code } = chunk;

              /**
               * SourceMapを生成する
               * @see https://github.com/rollup/rollup/blob/v1.31.1/src/rollup/index.ts#L427-L438
               */
              if (outputOptions.sourcemap && chunk.map) {
                let sourceMapURL = '';
                if (outputOptions.sourcemap === 'inline') {
                  sourceMapURL = chunk.map.toUrl();
                } else {
                  sourceMapURL = `${path.basename(filepath)}.map`;
                  filesMap.set(`${filepath}.map`, chunk.map.toString());
                }
                if (outputOptions.sourcemap !== 'hidden') {
                  code += `//# sourceMappingURL=${sourceMapURL}\n`;
                }
              }

              /*
               * Dynamic import()を使用するチャンクなのかを判定
               */
              const useDynamicImports = (function isUseDynamicImports(
                chunkOrAsset,
                resolvingChunkSet = new Set(),
              ) {
                // チャンクではないものは除外
                if (!chunkOrAsset || chunkOrAsset.type !== 'chunk')
                  return false;
                const chunk = chunkOrAsset;

                // Dynamic import()を使用している場合はtrue
                if (chunk.dynamicImports.length >= 1) return true;

                // 再帰処理中に処理中のチャンクを検出した場合はスキップする
                if (resolvingChunkSet.has(chunkOrAsset)) return false;

                // 現在のチャンクを処理中としてマーク
                // 自己参照再帰により処理エラー回避のため
                resolvingChunkSet.add(chunkOrAsset);

                // 静的importしたスクリプト内でDynamic import()が使用されているか検証
                const result = chunk.imports.some(importedFileName =>
                  (
                    chunkOrAssetMap.get(importedFileName) || []
                  ).some(subChunkOrAsset =>
                    isUseDynamicImports(subChunkOrAsset, resolvingChunkSet),
                  ),
                );

                // 現在のチャンクを処理中から除外
                resolvingChunkSet.delete(chunkOrAsset);

                return result;
              })(chunk);

              filesMap.set(filepath, code);
              chunkMap.set(chunk.facadeModuleId, {
                filepath,
                chunk,
                useDynamicImports,
              });
            }
          }

          bundleOutputCache[rollupOutputOpts.format] = {
            outputOptions,
            filesMap,
            chunkMap,
          };
        }

        bundleOutputCacheMap.set(
          [metalsmith, files, metalsmithDestDir, buildID],
          bundleOutputCache,
        );
      }

      const esmChunkMap = bundleOutputCache.esm.chunkMap;
      const {
        outputOptions: systemJsOutputOptions,
        chunkMap: systemJsChunkMap,
      } = bundleOutputCache.system;
      for (const { filesMap } of [
        bundleOutputCache.esm,
        bundleOutputCache.system,
      ]) {
        for (const [filepath, contents] of filesMap) {
          addMetalsmithFile(
            metalsmith,
            files,
            filepath,
            typeof contents === 'string' ? contents : Buffer.from(contents),
          );
        }
      }

      /*
       * SystemJSを追加する
       */
      const { filename: systemJsFilename } = addMetalsmithFile(
        metalsmith,
        files,
        path.resolve(systemJsOutputOptions.dir, 's.min.js'),
        await readFileAsync(require.resolve('systemjs/dist/s.min.js')),
      );

      /*
       * Promise Polyfillを追加する
       * SystemJSで必要
       */
      const { filename: promisePolyfillFilename } = addMetalsmithFile(
        metalsmith,
        files,
        path.resolve(systemJsOutputOptions.dir, 'promise-polyfill.min.js'),
        await readFileAsync(
          require.resolve('promise-polyfill/dist/polyfill.min.js'),
        ),
      );

      /*
       * script要素を置換する
       */
      for (const [
        filename,
        { filedata, htmlAST, scriptNodeMap },
      ] of targetFileMap) {
        /** @type {Set.<string>} */
        const removedSrcFullpathSet = new Set();
        let isSupportsDynamicImportInserted = false;

        for (const [parentNode, scriptNodeList] of scriptNodeMap) {
          const insertScriptNodeList = scriptNodeList
            .map(scriptNodeData => ({
              ...scriptNodeData,
              esmChunkData: esmChunkMap.get(scriptNodeData.srcFullpath),
              systemJsChunkData: systemJsChunkMap.get(
                scriptNodeData.srcFullpath,
              ),
            }))
            .filter(
              ({ esmChunkData, systemJsChunkData }) =>
                esmChunkData || systemJsChunkData,
            );
          if (insertScriptNodeList.length < 0) continue;
          const insertScriptList = insertScriptNodeList
            .map(
              ({
                node,
                attrs,
                srcFullpath,
                esmChunkData,
                systemJsChunkData,
              }) => {
                let insertedModuleScript = false;
                if (esmChunkData && !esmChunkData.useDynamicImports) {
                  insertAfter(
                    parentNode,
                    node,
                    createElement('script', [
                      new Set(['type', 'src']),
                      attrs,
                      {
                        type: 'module',
                        src: `/${toMetalsmithDestFilename(
                          metalsmith,
                          esmChunkData.filepath,
                        )}`,
                        defer: null,
                      },
                    ]),
                  );
                  insertedModuleScript = true;
                }

                /*
                 * 元のscript要素を削除する
                 */
                removeChild(parentNode, node);
                removedSrcFullpathSet.add(srcFullpath);

                /**
                 * @see https://html.spec.whatwg.org/multipage/scripting.html#attr-script-async
                 */
                return {
                  srcFullpath,
                  async: attrs.has('async'),
                  moduleOnly: attrs.get('type') === 'module',
                  insertedModuleScript,
                };
              },
            )
            .filter(Boolean);

          /*
           * ES module用のscript要素を挿入する
           */
          // 読み込む順序が決まっているJS。async属性未指定
          const esSyncFileList = insertScriptList
            .filter(
              ({ async, insertedModuleScript }) =>
                !async && !insertedModuleScript,
            )
            .map(
              ({ srcFullpath }) =>
                `/${toMetalsmithDestFilename(
                  metalsmith,
                  esmChunkMap.get(srcFullpath).filepath,
                )}`,
            );
          // 読み込む順序が不定のJS。async属性指定
          const esAsyncFileList = insertScriptList
            .filter(
              ({ async, insertedModuleScript }) =>
                async && !insertedModuleScript,
            )
            .map(
              ({ srcFullpath }) =>
                `/${toMetalsmithDestFilename(
                  metalsmith,
                  esmChunkMap.get(srcFullpath).filepath,
                )}`,
            );
          if (esSyncFileList.length >= 1 || esAsyncFileList.length >= 1) {
            // script要素内のJSコードを生成
            const esmScriptText = minifyJS(
              [
                esSyncFileList
                  .map((src, i) =>
                    i === 0
                      ? `import(${toJsValue(src)})`
                      : `.then(() => import(${toJsValue(src)}))`,
                  )
                  .join('') + ';',
                ...esAsyncFileList.map(src => `import(${toJsValue(src)});`),
                ...(isSupportsDynamicImportInserted
                  ? []
                  : [`window.supportsDynamicImport = 1;`]),
              ].join('\n'),
            );
            // script要素を追加
            appendChild(parentNode, createElement('script', {}, esmScriptText));
            isSupportsDynamicImportInserted = true;
          }

          /*
           * SystemJS用のscript要素を挿入する
           */
          // 読み込む順序が決まっているJS。async属性未指定
          const systemJsSyncFileList = insertScriptList
            .filter(({ async, moduleOnly }) => !async && !moduleOnly)
            .map(
              ({ srcFullpath }) =>
                `/${toMetalsmithDestFilename(
                  metalsmith,
                  systemJsChunkMap.get(srcFullpath).filepath,
                )}`,
            );
          // 読み込む順序が不定のJS。async属性指定
          const systemJsAsyncFileList = insertScriptList
            .filter(({ async, moduleOnly }) => async && !moduleOnly)
            .map(
              ({ srcFullpath }) =>
                `/${toMetalsmithDestFilename(
                  metalsmith,
                  systemJsChunkMap.get(srcFullpath).filepath,
                )}`,
            );
          if (
            systemJsSyncFileList.length >= 1 ||
            systemJsAsyncFileList.length >= 1
          ) {
            // script要素内のJSコードを生成
            const systemJsScriptText = minifyJS(
              [
                `
                if (!window.supportsDynamicImport) {
                  const init = function() {`,
                systemJsSyncFileList
                  .map((src, i) => {
                    const importCode = `System.import(${toJsValue(src)})`;
                    return i === 0
                      ? importCode
                      : `.then(function() { return ${importCode}; })`;
                  })
                  .join('\n') + ';',
                ...systemJsAsyncFileList.map(
                  src => `System.import(${toJsValue(src)});`,
                ),
                `
                  };
                  const importScript = function(jspath, callback) {
                    const doc = document;
                    const jsLoaderElem = doc.createElement('script');
                    jsLoaderElem.addEventListener('load', callback);
                    jsLoaderElem.src = jspath;
                    doc.head.appendChild(jsLoaderElem);
                  };
                  if (
                    typeof Promise !== 'function' ||
                    typeof Promise.prototype.finally !== 'function'
                  ) {
                    importScript('/${promisePolyfillFilename}', function() {
                      importScript('/${systemJsFilename}', init);
                    });
                  } else {
                    importScript('/${systemJsFilename}', init);
                  }
                }`,
              ].join('\n'),
            );
            // script要素を追加
            appendChild(
              parentNode,
              createElement('script', {}, systemJsScriptText),
            );
          }
        }

        if (options.removePreload) {
          /*
           * HTMLに含まれるlink要素のうち、置換したJSのpreloadを除去する
           */
          walkParse5(htmlAST, targetNode => {
            if (targetNode.tagName !== 'link') return;

            const linkElemNode = targetNode;
            const linkElemAttrs = getAttrMap(linkElemNode.attrs);

            if (linkElemAttrs.get('rel') !== 'preload') return;
            if (linkElemAttrs.get('as') !== 'script') return;

            const href = linkElemAttrs.get('href');
            if (!href || !href.startsWith('/')) return;
            const preloadFileFullpath = path.join(jsRootDirPath, href);

            if (removedSrcFullpathSet.has(preloadFileFullpath)) {
              removeChild(null, targetNode);
            }
          });
        }

        /**
         * HTMLの内容を更新する
         */
        filedata.contents = Buffer.from(parse5.serialize(htmlAST));
      }
    },
  });
};
