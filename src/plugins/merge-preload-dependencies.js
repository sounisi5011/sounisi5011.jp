const path = require('path');

function unique(array) {
  return [...new Set(array)];
}

function isValidPreloadURLs(value) {
  return Array.isArray(value) && value.every(url => typeof url === 'string');
}

function findFilename(files, filepath) {
  if (files.hasOwnProperty(filepath)) {
    return filepath;
  }

  const normalizedPath = path.normalize(filepath);
  const matchFilename = Object.keys(files).find(
    filename => path.normalize(filename) === normalizedPath,
  );

  if (matchFilename) {
    return matchFilename;
  }

  return undefined;
}

/*
 * URLを出力ディレクトリから見た相対パスに変換する
 */
function url2filename(url, filepath, destDirpath) {
  if (url.startsWith('/')) {
    return url.substring(1);
  } else {
    return path.relative(
      destDirpath,
      path.resolve(destDirpath, path.dirname(filepath), url),
    );
  }
}

/**
 * [dependenciesKey]プロパティに格納されたファイルデータから、
 * [preloadURLsKey]プロパティに格納されたpreload対象のURLを取得する。
 * @return {Array.<Array.<string>>}
 */
function dependencies2preloadURLs(filedata, dependenciesKey, preloadURLsKey) {
  return Object.values(filedata[dependenciesKey] || {})
    .filter(
      dependentFiledata =>
        dependentFiledata &&
        isValidPreloadURLs(dependentFiledata[preloadURLsKey]),
    )
    .map(dependentFiledata => dependentFiledata[preloadURLsKey]);
}

function resolvePreload(
  files,
  filepath,
  filedata,
  destDirpath,
  options,
  resolvedFilesSet,
) {
  const { preloadURLsKey, dependenciesKey } = options;

  /*
   * 解決済のファイルはスキップする
   */
  if (resolvedFilesSet.has(filepath)) {
    return;
  }

  /*
   * [preloadURLsKey]プロパティが未定義の場合は初期化する
   */
  if (!filedata.hasOwnProperty(preloadURLsKey)) {
    filedata[preloadURLsKey] = [];
  }

  /*
   * [preloadURLsKey]プロパティの値が配列ではない場合はスキップする
   */
  if (!Array.isArray(filedata[preloadURLsKey])) {
    return;
  }

  /*
   * [dependenciesKey]プロパティに格納されたファイルから、
   * preload対象のファイル一覧を取得する
   */
  const newDependencies = dependencies2preloadURLs(
    filedata,
    dependenciesKey,
    preloadURLsKey,
  );

  /*
   * preload対象の各ファイルに関連付けられたpreload対象のファイル一覧を取得する
   * TODO: 再帰的なpreloadへの対応
   */
  const newPreloadURLList = unique(
    filedata[preloadURLsKey].concat(...newDependencies),
  ).map(url => {
    const preloadFilepath = findFilename(
      files,
      url2filename(url, filepath, destDirpath),
    );
    const preloadFiledata = files[preloadFilepath];

    if (!preloadFiledata) {
      return [];
    }

    resolvePreload(
      files,
      preloadFilepath,
      preloadFiledata,
      destDirpath,
      options,
      resolvedFilesSet,
    );

    return preloadFiledata[preloadURLsKey];
  });

  /*
   * preload対象のファイル一覧を追加する
   */
  filedata[preloadURLsKey] = unique(
    filedata[preloadURLsKey].concat(...newDependencies, ...newPreloadURLList),
  );

  /*
   * 現在のファイルを解決済一覧に追加
   */
  resolvedFilesSet.add(filepath);
}

module.exports = opt => {
  const options = {
    dependenciesKey: 'dependencies',
    preloadURLsKey: 'preloadDependencies',
    ...opt,
  };

  return (files, metalsmith, done) => {
    const resolvedFilesSet = new Set();

    Object.entries(files).forEach(([filepath, filedata]) => {
      resolvePreload(
        files,
        filepath,
        filedata,
        metalsmith.destination(),
        options,
        resolvedFilesSet,
      );
    });

    done();
  };
};
