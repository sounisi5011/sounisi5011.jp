const path = require('path');

const fileExists = require('file-exists');
const isUrl = require('is-url');
const pluginKit = require('metalsmith-plugin-kit');
const { MultikeyMap } = require('multikey-map');
const parse5 = require('parse5');
const rollup = require('rollup');
const MIMEType = require('whatwg-mimetype');

const utils = require('./utils');
const parse5UtilsGenerator = require('./utils/parse5');

const parse5Utils = parse5UtilsGenerator();

/**
 * @typedef {{ path: (function(): string), destination: (function(): string) }} Metalsmith
 * @typedef {Object.<string, MetalsmithFileData>} MetalsmithFiles
 * @typedef {{ contents: Buffer }} MetalsmithFileData
 * @typedef {{ implementationIsUnknown: true }} Parse5Node
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
   *             srcFullpath: string,
   *             moduleOnly: boolean
   *           }[]>
   *        }>}
   */
  const targetFileMap = new Map();
  /**
   * ES Modules向けにビルドするソースファイルの絶対パスのSet
   * @type {Set.<string>}
   */
  const moduleScriptFileFullpathSet = new Set();
  /**
   * ES Modules非対応環境向けにビルドするソースファイルの絶対パスのSet
   * @type {Set.<string>}
   */
  const classicScriptFileFullpathSet = new Set();
  /**
   * @typedef {Map.<string, string | Buffer>} FilesMap
   * @typedef {Map.<string, {outputFileFullpath: string, chunk: ChunkInfo, useDynamicImports: boolean}>} ChunkMap
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
      moduleScriptFileFullpathSet.clear();
      classicScriptFileFullpathSet.clear();
    },
    async each(filename, filedata, files, metalsmith) {
      /*
       * HTMLをパースし、ASTを作成する
       */
      const htmlAST = parse5.parse(filedata.contents.toString());

      /*
       * HTMLに含まれるscript要素を探す
       */
      parse5Utils.walk(htmlAST, targetNode => {
        if (!parse5Utils.isElemNode(targetNode, 'script')) return;

        const scriptElemNode = targetNode;
        const scriptElemAttrs = parse5Utils.getAttrMap(scriptElemNode);

        /**
         * type属性値の値が以下に当てはまらない場合は処理しない
         * + 未定義
         * + 空文字列
         * + JSのMIMEタイプ
         * + "module"
         * @see https://html.spec.whatwg.org/multipage/scripting.html#attr-script-type
         */
        const type = scriptElemAttrs.get('type');
        const moduleOnly = type === 'module';
        if (type) {
          if (
            !moduleOnly &&
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
          !moduleOnly &&
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
        moduleScriptFileFullpathSet.add(scriptFileFullpath);
        if (!moduleOnly) {
          classicScriptFileFullpathSet.add(scriptFileFullpath);
        }

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
                parse5Utils.getParentNode(scriptElemNode),
                [
                  {
                    node: scriptElemNode,
                    attrs: scriptElemAttrs,
                    srcFullpath: scriptFileFullpath,
                    moduleOnly,
                  },
                ],
              ],
            ]),
          });
        } else {
          const { scriptNodeMap } = targetFileData;
          const scriptParentNode = parse5Utils.getParentNode(scriptElemNode);
          const scriptNodeList = scriptNodeMap.get(scriptParentNode);
          if (scriptNodeList) {
            scriptNodeList.push({
              node: scriptElemNode,
              attrs: scriptElemAttrs,
              srcFullpath: scriptFileFullpath,
              moduleOnly,
            });
          } else {
            scriptNodeMap.set(scriptParentNode, [
              {
                node: scriptElemNode,
                attrs: scriptElemAttrs,
                srcFullpath: scriptFileFullpath,
                moduleOnly,
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
          .sort(([a], [b]) => utils.cmp(a, b))
          .reduce(
            (obj, [filename, { scriptNodeMap }]) => ({
              ...obj,
              [filename]: [...scriptNodeMap]
                .map(([parentNode, scriptNodeList]) => [
                  parse5Utils.getNodePath(parentNode),
                  scriptNodeList,
                ])
                .sort(([a], [b]) => utils.cmp(a, b))
                .reduce(
                  (obj, [parentNodePath, scriptNodeList]) => ({
                    ...obj,
                    [parentNodePath]: scriptNodeList
                      .map(({ srcFullpath, moduleOnly }) => ({
                        src: srcFullpath,
                        moduleOnly,
                      }))
                      .sort(({ src: a }, { src: b }) => utils.cmp(a, b)),
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

        bundleOutputCache = {};
        for (const { isESModules, entryFullpathSet, ...rollupOutputOpts } of [
          // ES module用
          {
            isESModules: true,
            entryFullpathSet: moduleScriptFileFullpathSet,
            entryFileNames: '[name].mjs',
            chunkFileNames: '[name]-[hash].mjs',
            format: 'esm',
          },
          // SystemJS用
          {
            isESModules: false,
            entryFullpathSet: classicScriptFileFullpathSet,
            entryFileNames: '[name].system.js',
            chunkFileNames: '[name]-[hash].system.js',
            format: 'system',
          },
        ]) {
          const { output: rollupOutputOptions, ...rollupInputOptions } =
            typeof rollupOptionsGenerator === 'function'
              ? await rollupOptionsGenerator(isESModules)
              : rollupOptionsGenerator;

          /**
           * RollupのinputOptionsを生成する
           * @see https://rollupjs.org/guide/en/#inputoptions-object
           */
          /** @type {Object.<string, string>} */
          const entryRecord = {};
          for (const entryFullpath of entryFullpathSet) {
            // Note: 本来は、このように事前にファイルの存在を検証するべきではない。処理開始までの間にファイルが削除される可能性が存在するため。
            // TODO: rollup内での処理時にファイルの存在判定を行い、除外する
            if (!(await fileExists(entryFullpath))) continue;
            const entryName = path
              .relative(jsRootDirPath, entryFullpath)
              .replace(/\.m?js$/, '');
            entryRecord[entryName] = entryFullpath;
          }
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
          const outputOptions = {
            ...rollupOutputOptions,
            dir: path.resolve(
              metalsmithDestDir,
              rollupOutputOptions.dir || '.',
            ),
            ...rollupOutputOpts,
          };
          if (!utils.isSameOrSubPath(metalsmithDestDir, outputOptions.dir)) {
            throw new Error(
              `rollupOptions.output.dirに指定するパスは、Metalsmithの出力ディレクトリ以下のパスでなければなりません：${outputOptions.dir}`,
            );
          }

          /*
           * RollupでJSをビルドする
           */
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
            const outputFileFullpath = path.resolve(
              outputOptions.dir,
              chunkOrAsset.fileName,
            );
            if (chunkOrAsset.type === 'asset') {
              const asset = chunkOrAsset;
              filesMap.set(outputFileFullpath, asset.source);
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
                  sourceMapURL = `${path.basename(outputFileFullpath)}.map`;
                  filesMap.set(
                    `${outputFileFullpath}.map`,
                    chunk.map.toString(),
                  );
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

              filesMap.set(outputFileFullpath, code);
              chunkMap.set(chunk.facadeModuleId, {
                outputFileFullpath,
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
        for (const [outputFileFullpath, contents] of filesMap) {
          utils.addMetalsmithFile(
            metalsmith,
            files,
            outputFileFullpath,
            typeof contents === 'string' ? contents : Buffer.from(contents),
          );
        }
      }

      /*
       * SystemJSを追加する
       */
      const { filename: systemJsFilename } = utils.addMetalsmithFile(
        metalsmith,
        files,
        path.resolve(systemJsOutputOptions.dir, 's.min.js'),
        await utils.readFileAsync(require.resolve('systemjs/dist/s.min.js')),
      );

      /*
       * Promise Polyfillを追加する
       * SystemJSで必要
       */
      const { filename: promisePolyfillFilename } = utils.addMetalsmithFile(
        metalsmith,
        files,
        path.resolve(systemJsOutputOptions.dir, 'promise-polyfill.min.js'),
        await utils.readFileAsync(
          require.resolve('promise-polyfill/dist/polyfill.min.js'),
        ),
      );

      /*
       * script要素を置換する
       */
      for (const [, { filedata, htmlAST, scriptNodeMap }] of targetFileMap) {
        /*
         * 挿入するJSに関する情報を生成
         */
        let systemJsScriptCount = 0;
        const scriptNodeDataMap = new Map(
          [...scriptNodeMap].map(([parentNode, scriptNodeList]) => {
            const insertScriptNodeDataList = scriptNodeList
              .map(scriptNodeData => ({
                ...scriptNodeData,
                esmChunkData: esmChunkMap.get(scriptNodeData.srcFullpath),
                systemJsChunkData: systemJsChunkMap.get(
                  scriptNodeData.srcFullpath,
                ),
                /**
                 * @see https://html.spec.whatwg.org/multipage/scripting.html#attr-script-async
                 */
                async: scriptNodeData.attrs.has('async'),
              }))
              .filter(
                ({ esmChunkData, systemJsChunkData }) =>
                  esmChunkData || systemJsChunkData,
              );
            if (insertScriptNodeDataList.length < 0) return [];

            const esScriptNodeDataList = insertScriptNodeDataList
              .filter(({ esmChunkData }) => esmChunkData)
              .map(scriptNodeData => ({
                ...scriptNodeData,
                srcAttrValue: `/${utils.toMetalsmithDestFilename(
                  metalsmith,
                  scriptNodeData.esmChunkData.outputFileFullpath,
                )}`,
              }));
            const systemJsScriptNodeDataList = insertScriptNodeDataList
              .filter(
                ({ systemJsChunkData, moduleOnly }) =>
                  systemJsChunkData && !moduleOnly,
              )
              .map(scriptNodeData => ({
                ...scriptNodeData,
                srcAttrValue: `/${utils.toMetalsmithDestFilename(
                  metalsmith,
                  scriptNodeData.systemJsChunkData.outputFileFullpath,
                )}`,
              }));
            /** @type {Map.<Parse5Node, string>} */
            const originalScriptNodeMap = new Map([
              ...esScriptNodeDataList.map(({ node, srcFullpath }) => [
                node,
                srcFullpath,
              ]),
              ...systemJsScriptNodeDataList.map(({ node, srcFullpath }) => [
                node,
                srcFullpath,
              ]),
            ]);
            const esScriptNodeDataRecord = {
              // <script type=module> 形式で挿入するJS
              staticImport: esScriptNodeDataList.filter(
                ({ esmChunkData }) => !esmChunkData.useDynamicImports,
              ),
              dynamicImport: {
                // 順序を維持したDynamic import()で読み込むJS
                sync: esScriptNodeDataList.filter(
                  ({ async, esmChunkData }) =>
                    esmChunkData.useDynamicImports && !async,
                ),
                // 順不同のDynamic import()で読み込むJS
                async: esScriptNodeDataList.filter(
                  ({ async, esmChunkData }) =>
                    esmChunkData.useDynamicImports && async,
                ),
              },
            };
            const staticImportSrcFullpathSet = new Set(
              esScriptNodeDataRecord.staticImport.map(
                ({ srcFullpath }) => srcFullpath,
              ),
            );
            const scriptNodeDataRecord = {
              es: esScriptNodeDataRecord,
              systemJs: {
                staticImport: {
                  // 順序を維持したSystemJSで読み込むnomoduleのみのJS
                  sync: systemJsScriptNodeDataList.filter(
                    ({ async, srcFullpath }) =>
                      !async && staticImportSrcFullpathSet.has(srcFullpath),
                  ),
                  // 順序を維持したSystemJSで読み込むJS
                  async: systemJsScriptNodeDataList.filter(
                    ({ async, srcFullpath }) =>
                      async && staticImportSrcFullpathSet.has(srcFullpath),
                  ),
                },
                dynamicImport: {
                  // 順不同のSystemJSで読み込むnomoduleのみのJS
                  sync: systemJsScriptNodeDataList.filter(
                    ({ async, srcFullpath }) =>
                      !async && !staticImportSrcFullpathSet.has(srcFullpath),
                  ),
                  // 順不同のSystemJSで読み込むJS
                  async: systemJsScriptNodeDataList.filter(
                    ({ async, srcFullpath }) =>
                      async && !staticImportSrcFullpathSet.has(srcFullpath),
                  ),
                },
              },
            };
            const hasEsDynamic =
              scriptNodeDataRecord.es.dynamicImport.sync.length >= 1 ||
              scriptNodeDataRecord.es.dynamicImport.async.length >= 1;
            const hasSystemJsStatic =
              scriptNodeDataRecord.systemJs.staticImport.sync.length >= 1 ||
              scriptNodeDataRecord.systemJs.staticImport.async.length >= 1;
            const hasSystemJsDynamic =
              scriptNodeDataRecord.systemJs.dynamicImport.sync.length >= 1 ||
              scriptNodeDataRecord.systemJs.dynamicImport.async.length >= 1;

            if (hasSystemJsStatic) {
              systemJsScriptCount++;
            }
            if (hasSystemJsDynamic) {
              systemJsScriptCount++;
            }

            return [
              parentNode,
              {
                originalScriptNodeMap,
                scriptNodeDataRecord,
                hasEsDynamic,
                hasSystemJsStatic,
                hasSystemJsDynamic,
              },
            ];
          }),
        );

        /*
         * script要素を挿入・削除する
         */
        const templateCallback = scriptNodeData => (
          templateText,
          { groupReplacer, variableReplacer },
        ) => {
          return variableReplacer(
            groupReplacer(templateText, {
              SUPPORTS_DYNAMIC_IMPORT: body =>
                isSupportsDynamicImportInserted ? '' : body,
              'JS_SRC_LIST:loop': !scriptNodeData
                ? () => null
                : body =>
                    [
                      scriptNodeData.sync.map(
                        ({ srcAttrValue }) => srcAttrValue,
                      ),
                      ...scriptNodeData.async.map(({ srcAttrValue }) => [
                        srcAttrValue,
                      ]),
                    ]
                      .map(srcAttrValueList =>
                        variableReplacer(
                          srcAttrValueList
                            .map((srcAttrValue, index) =>
                              groupReplacer(body, ({ label, body }) => {
                                if (
                                  label === 'JS_SRC_LIST:head' &&
                                  index !== 0
                                ) {
                                  body = '';
                                }
                                if (
                                  label === 'JS_SRC_LIST:tail' &&
                                  index === 0
                                ) {
                                  body = '';
                                }
                                return variableReplacer(body, {
                                  JS_SRC: utils.toJsValue(srcAttrValue),
                                });
                              }),
                            )
                            .join(''),
                          {
                            JS_SRC_LIST: utils.toJsValue(srcAttrValueList),
                          },
                        ),
                      )
                      .join('\n'),
            }),
            {
              SUPPORTS_DYNAMIC_IMPORT: ({ globalVarName }) =>
                `${globalVarName}.supportsDynamicImport`,
              SYSTEM_JS_LOADER: ({ globalVarName }) =>
                `${globalVarName}.SystemJsLoader`,
              SYSTEM_JS_URL: utils.toJsValue(`/${systemJsFilename}`),
              PROMISE_POLYFILL_URL: utils.toJsValue(
                `/${promisePolyfillFilename}`,
              ),
            },
          );
        };
        let isSupportsDynamicImportInserted = false;
        let isSystemJsLoaderInserted = false;
        for (const [
          parentNode,
          {
            originalScriptNodeMap,
            scriptNodeDataRecord,
            hasEsDynamic,
            hasSystemJsStatic,
            hasSystemJsDynamic,
          },
        ] of scriptNodeDataMap) {
          /*
           * ES Modules static import用のscript要素を挿入
           */
          for (const { attrs, srcAttrValue } of scriptNodeDataRecord.es
            .staticImport) {
            parse5Utils.appendChild(
              parentNode,
              parse5Utils.createElement('script', [
                new Set(['type', 'src']),
                attrs,
                {
                  type: 'module',
                  src: srcAttrValue,
                  defer: null,
                },
              ]),
            );
          }

          /*
           * ES Modules Dynamic import()用のscript要素を挿入
           */
          if (hasEsDynamic) {
            // script要素内のJSコードを生成
            const esmScriptText = utils.minifyJS(
              await utils.templateConverter(
                [__dirname, 'templates/es-modules-dynamic-import.js'],
                templateCallback(scriptNodeDataRecord.es.dynamicImport),
              ),
            );

            // script要素を追加
            parse5Utils.appendChild(
              parentNode,
              parse5Utils.createElement(
                'script',
                {
                  // Note: type=module属性を指定されると、コードは常に非同期実行されるため、
                  //       Dynamic import()に対応しているか判定するための変数が更新されないまま後続のスクリプトが実行されてしまう。
                  //       このため、判定に必要な変数が既に定義済みの場合にのみtype属性を設定する。
                  type: isSupportsDynamicImportInserted ? 'module' : null,
                },
                esmScriptText,
              ),
            );
            isSupportsDynamicImportInserted = true;
          }

          /*
           * SystemJSによる動的ロード用のscript要素を挿入
           */
          if (hasSystemJsDynamic) {
            // script要素内のJSコードを生成
            const esmScriptText = utils.minifyJS(
              await utils.templateConverter(
                [
                  __dirname,
                  isSystemJsLoaderInserted
                    ? 'templates/system-js-dynamic-import-use-defined-loader.js'
                    : systemJsScriptCount >= 2
                    ? 'templates/system-js-dynamic-import-export-loader.js'
                    : 'templates/system-js-dynamic-import.js',
                ],
                templateCallback(scriptNodeDataRecord.systemJs.dynamicImport),
              ),
            );

            // script要素を追加
            parse5Utils.appendChild(
              parentNode,
              parse5Utils.createElement('script', {}, esmScriptText),
            );

            if (systemJsScriptCount >= 2) {
              isSystemJsLoaderInserted = true;
            }
          }

          /*
           * SystemJSによる静的ロード用のscript要素を挿入
           */
          if (hasSystemJsStatic) {
            /*
             * System JSが必要なコードが複数存在し、かつ、まだSystem JSが未定義の場合は、
             * System JSを読み込むコードを挿入する。
             */
            if (systemJsScriptCount >= 2 && !isSystemJsLoaderInserted) {
              // script要素内のJSコードを生成
              const esmScriptText = utils.minifyJS(
                await utils.templateConverter(
                  [__dirname, 'templates/system-js-export-loader.js'],
                  templateCallback(),
                ),
              );

              // script要素を追加
              // Note: Dynamic import()に対応していないブラウザ向けのフォールバックでもあるため、
              //       nomodule属性は指定しない。
              parse5Utils.appendChild(
                parentNode,
                parse5Utils.createElement('script', {}, esmScriptText),
              );

              isSystemJsLoaderInserted = true;
            }

            // script要素内のJSコードを生成
            const esmScriptText = utils.minifyJS(
              await utils.templateConverter(
                [
                  __dirname,
                  isSystemJsLoaderInserted
                    ? 'templates/system-js-static-import-use-defined-loader.js'
                    : 'templates/system-js-static-import.js',
                ],
                templateCallback(scriptNodeDataRecord.systemJs.staticImport),
              ),
            );

            // script要素を追加
            parse5Utils.appendChild(
              parentNode,
              parse5Utils.createElement(
                'script',
                { nomodule: '' },
                esmScriptText,
              ),
            );

            // Note: ここでisSystemJsLoaderInserted変数を更新しないように！
            //       nomodule属性がついているため、モジュールに対応したブラウザではコードが実行されない。
            //       このため、続くscript要素内でSystem JSが必要なモジュール対応ブラウザ向けのコードが動作しなくなってしまう。
          }

          /*
           * 古いscript要素を削除
           */
          for (const originalScriptNode of originalScriptNodeMap.keys()) {
            parse5Utils.detachNode(originalScriptNode);
          }

          if (options.removePreload) {
            /*
             * HTMLに含まれるlink要素のうち、置換したJSのpreloadを除去する
             */
            const removedSrcFullpathSet = new Set(
              originalScriptNodeMap.values(),
            );
            parse5Utils.walk(htmlAST, targetNode => {
              if (!parse5Utils.isElemNode(targetNode, 'link')) return;

              const linkElemNode = targetNode;
              const linkElemAttrs = parse5Utils.getAttrMap(linkElemNode);

              if (linkElemAttrs.get('rel') !== 'preload') return;
              if (linkElemAttrs.get('as') !== 'script') return;

              const href = linkElemAttrs.get('href');
              if (!href || !href.startsWith('/')) return;
              const preloadFileFullpath = path.join(jsRootDirPath, href);

              if (removedSrcFullpathSet.has(preloadFileFullpath)) {
                parse5Utils.detachNode(linkElemNode);
              }
            });
          }
        }

        /**
         * HTMLの内容を更新する
         */
        filedata.contents = Buffer.from(parse5.serialize(htmlAST));
      }
    },
  });
};
