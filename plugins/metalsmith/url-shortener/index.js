const path = require('path');

const easypass = require('@tanepiper/easypass-2');
const pluginKit = require('metalsmith-plugin-kit');
const fetch = require('node-fetch');
const strictUriEncode = require('strict-uri-encode');

const { encryptToFileData, decryptFromFileData } = require('./encrypt');
const { initOptions } = require('./options');

class URLMap {
  constructor(files) {
    this.urlMap = new Map();
    this.wordMap = new Map();
    this.existsFilenameList = Object.keys(files).map(
      this.normalizeWord.bind(this),
    );
  }

  getByURL(url) {
    return this.urlMap.get(url);
  }

  hasWord(word) {
    word = this.normalizeWord(word);
    return this.wordMap.has(word) || this.existsWord(word);
  }

  set({ url, word }) {
    word = this.normalizeWord(word);
    if (this.existsWord(word)) {
      throw new Error(
        `短縮URL ${word} は追加できません。重複する名前のファイルが存在します`,
      );
    }
    this.urlMap.set(url, word);
    this.wordMap.set(word, url);
  }

  *[Symbol.iterator]() {
    for (const [url, word] of this.urlMap) {
      yield { url, word };
    }
  }

  existsWord(word) {
    word = this.normalizeWord(word);
    return this.existsFilenameList.some(
      filepath =>
        filepath.startsWith(word) &&
        ['', path.sep, '.'].includes(
          filepath.substring(word.length, word.length + 1),
        ),
    );
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
    },
  });
