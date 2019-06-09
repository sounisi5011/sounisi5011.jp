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
    ignoreCompilePattern: ['_*/**', '**/_*', '**/_*/**'],
    pattern: ['**/*.less'],
    renamer: filename => filename.replace(/\.less$/, '.css'),
    ...opts,
  };

  const patternList = Array.isArray(options.pattern)
    ? options.pattern
    : [options.pattern];
  const matchList = patternList.filter(pattern => !/^!/.test(pattern));
  const ignoreMatchList = patternList
    .filter(pattern => /^!/.test(pattern))
    .map(pattern => pattern.replace(/^!/, ''));
  const ignoreCompilematcher = pluginKit.filenameMatcher(
    options.ignoreCompilePattern,
  );

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const sourceFilepath = getSourceFullpath(metalsmith, filename);
      const convertedFilename = options.renamer(filename);
      const sourcemapFilename = `${convertedFilename}.map`;
      const sourcemapFullname = getDestFullpath(metalsmith, sourcemapFilename);

      if (
        filename !== convertedFilename &&
        !files.hasOwnProperty(convertedFilename)
      ) {
        if (!ignoreCompilematcher(filename)) {
          const sourceDirpath = path.dirname(sourceFilepath);
          const lessOptions = {
            filename: sourceFilepath,
            paths: [sourceDirpath],
            sourceMap: {
              sourceMapBasepath: sourceDirpath,
              sourceMapFilename: path.basename(sourcemapFullname),
              sourceMapFullFilename: sourcemapFullname,
              sourceMapInputFilename: sourceFilepath,
              sourceMapOutputFilename: path.basename(convertedFilename),
              sourceMapRootpath: path.relative(
                path.dirname(sourcemapFullname),
                sourceDirpath,
              ),
            },
          };

          const lessText = file.contents.toString();
          const { css: cssText, map: sourcemapText } = await less.render(
            lessText,
            lessOptions,
          );
          pluginKit.addFile(files, convertedFilename, cssText);
          if (typeof sourcemapText === 'string') {
            pluginKit.addFile(files, sourcemapFilename, sourcemapText);
          }
        }

        delete files[filename];
      }
    },
    match: matchList,
    matchOptions: {
      ignore: ignoreMatchList,
    },
  });
};