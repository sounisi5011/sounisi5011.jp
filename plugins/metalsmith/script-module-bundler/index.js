const path = require('path');

const fileExists = require('file-exists');
const isUrl = require('is-url');
const pluginKit = require('metalsmith-plugin-kit');
const parse5 = require('parse5');
const rollup = require('rollup');
const walkParse5 = require('walk-parse5');
const MIMEType = require('whatwg-mimetype');

const {
  getAttrMap,
  removeChild,
  appendChild,
  createElement,
} = require('./parse5-utils');
const { toJsValue, readFileAsync, minifyJS } = require('./utils');

module.exports = opts => {
  const options = {
    pattern: ['**/*.html'],
    jsDirectory: '.',
    rollupOptions: {},
    removePreload: true,
    ...opts,
  };

  let jsRootDirPath = '';
  /** @type {Map.<string, {filedata: Object, htmlAST: Object, scriptNodeMap: Map.<Object, { node: Object, attrs: Map.<string, string>, srcFullpath: string }[]>}>} */
  const targetFileMap = new Map();
  /** @type {Set.<string>} */
  const scriptFileFullpathSet = new Set();

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
       * Rollupのオプションを生成する
       */
      const { output: rollupOutputOptions, ...rollupInputOptions } =
        typeof options.rollupOptions === 'function'
          ? await options.rollupOptions(files, metalsmith)
          : options.rollupOptions;

      /**
       * RollupのinputOptionsを生成する
       * @see https://rollupjs.org/guide/en/#inputoptions-object
       */
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
      const outputDir = metalsmith.destination();
      const outputOptions = {
        ...rollupOutputOptions,
        dir: outputDir,
      };

      /*
       * RollupでJSをビルドする
       */
      /** @type {Map.<string, Object>} */
      const esmChunkMap = new Map();
      /** @type {Map.<string, Object>} */
      const systemJsChunkMap = new Map();
      for (const { chunkMap, ...opts } of [
        // ES module用
        { entryFileNames: '[name].mjs', format: 'esm', chunkMap: esmChunkMap },
        // SystemJS用
        {
          entryFileNames: '[name].system.js',
          format: 'system',
          chunkMap: systemJsChunkMap,
        },
      ]) {
        const { output } = await bundle.generate({
          ...outputOptions,
          ...opts,
        });
        for (const chunkOrAsset of output) {
          const filename = chunkOrAsset.fileName;
          if (chunkOrAsset.type === 'asset') {
            const asset = chunkOrAsset;
            const contents = Buffer.isBuffer(asset.source)
              ? asset.source
              : Buffer.from(asset.source);
            pluginKit.addFile(files, filename, contents);
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
                sourceMapURL = `${path.basename(filename)}.map`;
                pluginKit.addFile(
                  files,
                  `${filename}.map`,
                  chunk.map.toString(),
                );
              }
              if (outputOptions.sourcemap !== 'hidden') {
                code += `//# sourceMappingURL=${sourceMapURL}\n`;
              }
            }

            pluginKit.addFile(files, filename, code);
            chunkMap.set(chunk.facadeModuleId, chunk);
          }
        }
      }

      /*
       * SystemJSを追加する
       */
      pluginKit.addFile(
        files,
        's.min.js',
        await readFileAsync(require.resolve('systemjs/dist/s.min.js')),
      );

      /*
       * Promise Polyfillを追加する
       * SystemJSで必要
       */
      pluginKit.addFile(
        files,
        'polyfill.min.js',
        await readFileAsync(
          require.resolve('promise-polyfill/dist/polyfill.min.js'),
        ),
      );

      /*
       * script要素を置換する
       */
      for (const [, { filedata, htmlAST, scriptNodeMap }] of targetFileMap) {
        /** @type {Set.<string>} */
        const removedSrcFullpathSet = new Set();
        let isSupportsDynamicImportInserted = false;

        for (const [parentNode, scriptNodeList] of scriptNodeMap) {
          const insertScriptNodeList = scriptNodeList.filter(
            ({ srcFullpath }) =>
              esmChunkMap.has(srcFullpath) || systemJsChunkMap.has(srcFullpath),
          );
          if (insertScriptNodeList.length < 0) continue;
          const insertScriptList = insertScriptNodeList.map(
            ({ node, attrs, srcFullpath }) => {
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
              };
            },
          );

          /*
           * ES module用のscript要素を挿入する
           */
          // 読み込む順序が決まっているJS。async属性未指定
          const esSyncFileList = insertScriptList
            .filter(({ async }) => !async)
            .map(
              ({ srcFullpath }) => `/${esmChunkMap.get(srcFullpath).fileName}`,
            );
          // 読み込む順序が不定のJS。async属性指定
          const esAsyncFileList = insertScriptList
            .filter(({ async }) => async)
            .map(
              ({ srcFullpath }) => `/${esmChunkMap.get(srcFullpath).fileName}`,
            );
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

          /*
           * SystemJS用のscript要素を挿入する
           */
          // 読み込む順序が決まっているJS。async属性未指定
          const systemJsSyncFileList = insertScriptList
            .filter(({ async, moduleOnly }) => !async && !moduleOnly)
            .map(
              ({ srcFullpath }) =>
                `/${systemJsChunkMap.get(srcFullpath).fileName}`,
            );
          // 読み込む順序が不定のJS。async属性指定
          const systemJsAsyncFileList = insertScriptList
            .filter(({ async, moduleOnly }) => async && !moduleOnly)
            .map(
              ({ srcFullpath }) =>
                `/${systemJsChunkMap.get(srcFullpath).fileName}`,
            );
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
                if (typeof Promise !== 'function') {
                  importScript('/polyfill.min.js', function() {
                    importScript('/s.min.js', init);
                  });
                } else {
                  importScript('/s.min.js', init);
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
