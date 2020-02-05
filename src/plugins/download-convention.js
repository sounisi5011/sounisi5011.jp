const path = require('path');

const download = require('download');
const isUrl = require('is-url');
const KeyvFile = require('keyv-file');
const pluginKit = require('metalsmith-plugin-kit');

function isValidPath(filepath) {
  if (typeof filepath === 'string') {
    return /(?:^|[/\\])[^/\\]*[^/\\.][^/\\]*$/.test(filepath);
  }
  return false;
}

function isValidDestination(destination) {
  if (typeof destination === 'string') {
    return isValidPath(destination);
  } else if (Array.isArray(destination)) {
    return destination.every(
      dest => typeof dest.source === 'string' && isValidPath(dest.destination),
    );
  }
  return false;
}

function normalizeEntryPath(entryPath) {
  return path.resolve('/', entryPath.replace(/\\/g, '/'));
}

function equalsPath(pathA, pathB) {
  return normalizeEntryPath(pathA) === normalizeEntryPath(pathB);
}

function statModeToOctal(mode) {
  /**
   * @see https://github.com/TooTallNate/stat-mode/blob/v0.2.0/index.js#L133-L136
   */
  return (mode & 0o7777).toString(8).padStart(4, 0);
}

function getSourceFullpath(metalsmith, filename) {
  return metalsmith.path(metalsmith.source(), filename);
}

function getSourceRelative(metalsmith, fullpath) {
  return path.relative(metalsmith.path(metalsmith.source()), fullpath);
}

function getFilename(metalsmith, currentFilename, destFilename) {
  const currentFileFullpath = getSourceFullpath(metalsmith, currentFilename);
  const destFileFullpath = path.resolve(
    path.dirname(currentFileFullpath),
    destFilename,
  );
  return getSourceRelative(metalsmith, destFileFullpath);
}

function processFileEntries({
  metalsmith,
  currentFilename,
  files,
  fileEntryList,
  destFileList,
}) {
  destFileList.forEach(
    ({ source: sourceFilepath, destination: destFilepath }) => {
      const fileEntry = fileEntryList.find(({ path }) =>
        equalsPath(path, sourceFilepath),
      );

      if (!fileEntry) {
        throw new Error(
          [
            `The source path "${sourceFilepath}" does not exist in the downloaded data:`,
            ...fileEntryList.map(fileEntry => `  * ${fileEntry.path}`).sort(),
          ].join('\n'),
        );
      }

      const destPath = getFilename(metalsmith, currentFilename, destFilepath);

      switch (fileEntry.type) {
        case 'file':
          pluginKit.addFile(files, destPath, fileEntry.data, {
            /**
             * @see https://github.com/segmentio/metalsmith/blob/v2.3.0/lib/index.js#L296
             * @see https://github.com/kevva/decompress/blob/v4.2.0/index.js#L46
             */
            mode: statModeToOctal(fileEntry.mode & ~process.umask()),
          });
          break;
        case 'directory':
          // TODO
          break;
        case 'symlink':
        case 'link':
          // TODO
          break;
      }
    },
  );
}

function processSingleFile({
  metalsmith,
  currentFilename,
  files,
  contents,
  destFilepath,
}) {
  const destPath = getFilename(metalsmith, currentFilename, destFilepath);
  pluginKit.addFile(files, destPath, contents);
}

module.exports = opts => {
  const options = {
    cacheFilename: path.join(
      process.cwd(),
      './cache/metalsmith-download-convention/keyv-file.json',
    ),
    override: false,
    pattern: ['**/*.download'],
    ...opts,
  };
  const store = new KeyvFile({
    filename: options.cacheFilename,
  });

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const { sourceURL, destination } = file;
      if (!isUrl(sourceURL) || !isValidDestination(destination)) {
        return;
      }

      const extractMode = Array.isArray(destination);
      const newFiles = {};
      const rawData = await download(sourceURL, {
        cache: store,
        extract: extractMode,
      }).catch(error => {
        if (error.name === 'HTTPError') {
          error.message = `Download failed with HTTP ${error.statusCode} ${error.statusMessage}: ${error.url}`;
        }
        throw error;
      });

      if (extractMode) {
        if (Array.isArray(rawData)) {
          processFileEntries({
            currentFilename: filename,
            destFileList: destination,
            fileEntryList: rawData,
            files: newFiles,
            metalsmith,
          });
        } else {
          // TODO: ダウンロードしたデータが圧縮ファイルではなかった場合の処理
        }
      } else {
        processSingleFile({
          contents: rawData,
          currentFilename: filename,
          destFilepath: destination,
          files: newFiles,
          metalsmith,
        });
      }

      Object.entries(newFiles).forEach(([newFilename, newFiledata]) => {
        if (options.override || !files.hasOwnProperty(newFilename)) {
          files[newFilename] = newFiledata;
        }
      });
      delete files[filename];
    },
    match: options.pattern,
  });
};
