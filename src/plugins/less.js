const path = require('path');

const less = require('less');
const pluginKit = require('metalsmith-plugin-kit');

function getSourceFullpath(metalsmith, filename) {
  return metalsmith.path(metalsmith.source(), filename);
}

function getDestFullpath(metalsmith, filename) {
  return metalsmith.path(metalsmith.destination(), filename);
}

module.exports = opts => {
  const options = {
    deleteConvertedFiles: true,
    dependenciesKey: 'dependencies',
    pattern: ['**/*.less', '!_*/**', '!**/_*', '!**/_*/**'],
    renamer: filename => filename.replace(/\.less$/, '.css'),
    sourceMap: true,
    ...opts,
  };

  const patternList = Array.isArray(options.pattern)
    ? options.pattern
    : [options.pattern];
  const matchList = patternList.filter(pattern => !/^!/.test(pattern));
  const ignoreMatchList = patternList
    .filter(pattern => /^!/.test(pattern))
    .map(pattern => pattern.replace(/^!/, ''));
  const ignoreMatcher = pluginKit.filenameMatcher(ignoreMatchList);

  const deleteFileSet = new Set();

  return pluginKit.middleware({
    after: files => {
      deleteFileSet.forEach(filename => {
        delete files[filename];
      });
      deleteFileSet.clear();
    },
    each: async (filename, file, files, metalsmith) => {
      const sourceDirFullpath = getSourceFullpath(metalsmith, '.');
      const sourceFilepath = getSourceFullpath(metalsmith, filename);
      const convertedFilename = options.renamer(filename);
      const sourcemapFilename = `${convertedFilename}.map`;

      if (
        filename !== convertedFilename &&
        !files.hasOwnProperty(convertedFilename) &&
        !ignoreMatcher(filename)
      ) {
        const sourceDirpath = path.dirname(sourceFilepath);
        const lessOptions = {
          filename: sourceFilepath,
          paths: [sourceDirpath],
        };

        if (options.sourceMap) {
          const sourcemapFullname = getDestFullpath(
            metalsmith,
            sourcemapFilename,
          );

          lessOptions.sourceMap = {
            sourceMapBasepath: sourceDirpath,
            sourceMapFilename: path.basename(sourcemapFullname),
            sourceMapFullFilename: sourcemapFullname,
            sourceMapInputFilename: sourceFilepath,
            sourceMapOutputFilename: path.basename(convertedFilename),
            sourceMapRootpath: path.relative(
              path.dirname(sourcemapFullname),
              sourceDirpath,
            ),
          };
        }

        const lessText = file.contents.toString();
        const {
          css: cssText,
          map: sourcemapText,
          imports: importAbsolutePathList,
        } = await less.render(lessText, lessOptions);

        pluginKit.addFile(files, convertedFilename, cssText);
        const convertedFileData = files[convertedFilename];

        if (options.dependenciesKey) {
          convertedFileData[options.dependenciesKey] = [
            ...new Set([
              filename,
              ...importAbsolutePathList.map(absolutePath =>
                path.relative(sourceDirFullpath, absolutePath),
              ),
            ]),
          ].reduce((obj, filename) => {
            obj[filename] = files[filename];
            return obj;
          }, {});
        }

        if (typeof sourcemapText === 'string') {
          pluginKit.addFile(files, sourcemapFilename, sourcemapText);
        }

        if (options.deleteConvertedFiles) {
          deleteFileSet.add(filename);
        }
      }
    },
    match: matchList,
  });
};
