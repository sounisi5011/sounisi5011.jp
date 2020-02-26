const path = require('path');

function unique(array) {
  return [...new Set(array)];
}

function findFilename(files, filepath) {
  if (Object.prototype.hasOwnProperty.call(files, filepath)) {
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

function assignArrayProps(filedata, ...dependentFiledata) {
  const dependentMetadataMap = new Map();

  dependentFiledata.forEach(dependentFiledata => {
    if (!dependentFiledata) {
      return;
    }
    (dependentFiledata instanceof Map
      ? dependentFiledata
      : Object.entries(dependentFiledata)
    ).forEach(([prop, value]) => {
      if (!dependentMetadataMap.has(prop)) {
        dependentMetadataMap.set(prop, value);
      } else {
        const prevValue = dependentMetadataMap.get(prop);
        if (Array.isArray(prevValue) && Array.isArray(value)) {
          dependentMetadataMap.set(prop, [...prevValue, ...value]);
        }
      }
    });
  });

  dependentMetadataMap.forEach((value, prop) => {
    if (Array.isArray(value)) {
      if (Object.prototype.hasOwnProperty.call(filedata, prop)) {
        const origValue = filedata[prop];
        if (Array.isArray(origValue)) {
          filedata[prop] = unique([...origValue, ...value]);
        }
      } else {
        filedata[prop] = [...value];
      }
    }
  });

  return filedata;
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
  if (!Object.prototype.hasOwnProperty.call(filedata, preloadURLsKey)) {
    filedata[preloadURLsKey] = [];
  }

  /*
   * [preloadURLsKey]プロパティの値が配列ではない場合はスキップする
   */
  if (!Array.isArray(filedata[preloadURLsKey])) {
    return;
  }

  /*
   * [dependenciesKey]プロパティで指定された依存ファイルのメタデータを追加する
   */
  if (Object.prototype.hasOwnProperty.call(filedata, dependenciesKey)) {
    const dependentFiles = filedata[dependenciesKey];
    if (dependentFiles) {
      assignArrayProps(filedata, ...Object.values(dependentFiles));
    }
  }

  /*
   * preload対象の各ファイルに関連付けられたpreload対象のファイル一覧を取得する
   * TODO: 再帰的なpreloadへの対応
   */
  const preloadFiledataList = unique(filedata[preloadURLsKey])
    .filter(url => typeof url === 'string')
    .map(url => {
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

      return preloadFiledata;
    });

  /*
   * preload対象のファイルのメタデータを追加する
   */
  assignArrayProps(filedata, ...preloadFiledataList);

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
