const path = require('path');

const easypass = require('@tanepiper/easypass-2');
const pluginKit = require('metalsmith-plugin-kit');
const fetch = require('node-fetch');
const strictUriEncode = require('strict-uri-encode');

const { encryptToFileData, decryptFromFileData } = require('./encrypt');
const { initOptions } = require('./options');

class URLMap {
  /**
   * @param {Object.<string, Object>} files
   */
  constructor(files) {
    /**
     * @private
     * @readonly
     * @type {Map.<string, string>}
     */
    this.__urlMap = new Map();
    /**
     * @private
     * @readonly
     * @type {Map.<string, string>}
     */
    this.__wordMap = new Map();
    /**
     * @private
     * @readonly
     */
    this.__files = files;
  }

  /**
   * @param {string} url
   */
  getByURL(url) {
    return this.__urlMap.get(url);
  }

  /**
   * @param {string} word
   */
  hasWord(word) {
    word = this.normalizeWord(word);
    return this.__wordMap.has(word) || this.existsWord(word);
  }

  /**
   * @param {{ url: string, word: string }} param0
   */
  set({ url, word }) {
    word = this.normalizeWord(word);
    if (this.existsWord(word)) {
      throw new Error(
        `短縮URL ${word} は追加できません。重複する名前のファイルが存在します`,
      );
    }
    this.__urlMap.set(url, word);
    this.__wordMap.set(word, url);
  }

  *[Symbol.iterator]() {
    for (const [url, word] of this.__urlMap) {
      yield { url, word };
    }
  }

  /**
   * @param {string} word
   * @param {string[]} existsFilenameList
   */
  existsWord(word, existsFilenameList = Object.keys(this.__files)) {
    word = this.normalizeWord(word);

    return existsFilenameList.some(filepath => {
      filepath = this.normalizeWord(filepath);
      return (
        filepath === word ||
        (filepath.startsWith(word) &&
          /^[./\\]/.test(filepath.substring(word.length)))
      );
    });
  }

  normalizeWord(word) {
    return path.normalize(word).replace(new RegExp(`\\${path.sep}+$`), '');
  }
}

function filename2url(filename, rootURL, getURLObject = false) {
  const url = new URL(filename, rootURL);
  return getURLObject ? url : url.href;
}

/**
 * @param {string} filepath
 * @returns {string}
 * Note: WHATWG URL APIは以下の問題があるため使用しない:
 *       - バックスラッシュをスラッシュに置換してしまう。Unixでは、バックスラッシュもファイル名の一部
 *       - 連続するスラッシュを省略しない。
 */
function filepath2RootRelativeURL(filepath) {
  const normalizedRootPath = path.join(path.sep, filepath);
  return normalizedRootPath
    .split(path.sep)
    .map(strictUriEncode)
    .join('/');
}

function getOrDefineFiledata(files, filename, defaultFiledata = {}) {
  let filedata = files[filename];
  if (!filedata) {
    const { contents = '', ...options } = defaultFiledata;
    pluginKit.addFile(files, filename, contents, options);
    filedata = files[filename];
  }
  return filedata;
}

/** @type {WeakMap.<Object, {options: Object, encryptKey: Buffer, urlMap: URLMap}>} */
const optionsMap = new WeakMap();

exports.init = opts => {
  const { options, encryptKey } = initOptions(opts);

  return pluginKit.middleware({
    async before(files, metalsmith) {
      /*
       * アップロード済みの定義ファイルを読み込む
       */
      const urlMap = new URLMap(files);
      const res = await fetch(
        filename2url(options.urlListFilename, options.rootURL),
      );
      if (res.ok) {
        const defsFileData = await decryptFromFileData(
          encryptKey,
          await res.buffer(),
        );
        const defsFileText = defsFileData.toString();
        defsFileText.split(/\n+/).forEach(line => {
          const match = /^([^?#\s]+) +(\S+)/.exec(line);
          if (!match) return;
          const [, word, targetURL] = match;
          urlMap.set({ word, url: targetURL });
        });
      }

      /**
       * @param {string} url
       * @returns {string}
       */
      const createShortWord = url => {
        const foundWord = urlMap.getByURL(url);
        if (foundWord) return foundWord;

        for (let i = 1000; i--; ) {
          const word =
            options.wordPrefix + easypass.generate(options.wordLength);
          if (!urlMap.hasWord(word)) {
            urlMap.set({ word, url });
            return word;
          }
        }

        throw new Error('短縮URLの生成が失敗しました');
      };
      Object.assign(metalsmith.metadata(), {
        /**
         * 短縮URLを生成する
         * @param {string} url 短縮URLを生成する元のURL
         * @param {string} rootURL 短縮URLの先頭に追加するルートURL
         * @returns {string}
         */
        createShortURL(url, rootURL = options.rootURL) {
          const dummyWord = options.wordPrefix + 'x'.repeat(options.wordLength);
          /*
           * 元のURLが短縮URLよりも短い場合は、短縮URLを生成しない
           */
          if (
            url.length <
            (rootURL ? filename2url(dummyWord, rootURL) : dummyWord).length
          )
            return url;
          const word = createShortWord(url);
          return rootURL
            ? filename2url(word, options.rootURLShrinker(rootURL))
            : word;
        },
        /**
         * 生成済みの短縮URLを取得する
         * @param {string} url 短縮URLを探す元のURL
         * @param {string} rootURL 短縮URLの先頭に追加するルートURL
         * @returns {string|null} 短縮URL、または、見つからなかった場合にnull
         */
        lookupShortURL(url, rootURL = options.rootURL) {
          const foundWord = urlMap.getByURL(url);
          if (foundWord) {
            return rootURL
              ? filename2url(foundWord, options.rootURLShrinker(rootURL))
              : foundWord;
          }
          return null;
        },
      });

      optionsMap.set(files, { options, encryptKey, urlMap });
    },
  });
};

exports.generate = () =>
  pluginKit.middleware({
    async before(files, metalsmith) {
      const { options, encryptKey, urlMap } = optionsMap.get(files) || {};
      if (!options) return;

      /*
       * 生成した短縮URLと重複する名前のファイルが存在するか判定
       */
      const filepathList = Object.keys(files);
      /** @type {Map.<string, string[]} */
      const duplicationFilepathMap = new Map();
      for (const { word } of urlMap) {
        const duplicationFilepathList = filepathList.filter(filepath =>
          urlMap.existsWord(word, [filepath]),
        );
        if (duplicationFilepathList.length !== 0) {
          const shortURL = filename2url(
            word,
            options.rootURLShrinker(options.rootURL),
          );
          duplicationFilepathMap.set(shortURL, duplicationFilepathList);
        }
      }
      if (duplicationFilepathMap.size !== 0) {
        console.error(
          [
            '短縮URLと重複する名前のファイルが存在します:',
            ...[...duplicationFilepathMap].map(
              ([shortURL, duplicationFilepathList]) => {
                return [
                  shortURL,
                  ...duplicationFilepathList.map(filepath => `  * ${filepath}`),
                ]
                  .map(line => `  ${line}`)
                  .join('\n');
              },
            ),
          ].join('\n'),
        );
        throw new Error('短縮URLと重複する名前のファイルが存在します');
      }

      /*
       * ファイルを生成
       */
      const defsFileText = [...urlMap]
        .map(({ url, word }) => `${word} ${url}`)
        .join('\n');
      const defsFileData = await encryptToFileData(encryptKey, defsFileText);
      pluginKit.addFile(files, options.urlListFilename, defsFileData);

      /**
       * _headersファイルに書き込む
       * @see https://docs.netlify.com/routing/headers/
       */
      const headersFiledata = getOrDefineFiledata(files, '_headers');
      const isEmptyOrLFEnd =
        headersFiledata.contents.length === 0 ||
        headersFiledata.contents.subarray(-1).equals(Buffer.from('\n'));
      headersFiledata.contents = Buffer.concat([
        headersFiledata.contents,
        Buffer.from(
          (isEmptyOrLFEnd ? [] : [''])
            .concat([
              filename2url(options.urlListFilename, options.rootURL, true)
                .pathname,
              `  X-Robots-Tag: noindex`,
              ``,
            ])
            .join('\n'),
        ),
      ]);

      /**
       * _redirectsファイルに書き込む
       * @see https://docs.netlify.com/routing/redirects/
       * @see https://docs.netlify.com/routing/redirects/redirect-options/
       */
      const redirectsFiledata = getOrDefineFiledata(files, '_redirects', {
        contents: `${options.redirectsReplaceLine}\n`,
      });
      redirectsFiledata.contents = Buffer.from(
        String(redirectsFiledata.contents).replace(/^.+$/gm, line => {
          if (line !== options.redirectsReplaceLine) return line;
          return [...urlMap]
            .map(({ url, word }) => {
              if (url.startsWith(options.rootURL))
                url = url.substring(options.rootURL.length);
              return [filepath2RootRelativeURL(word), url].join(' ');
            })
            .sort()
            .join('\n');
        }),
      );

      delete metalsmith.metadata().createShortURL;
      delete metalsmith.metadata().lookupShortURL;
    },
  });
