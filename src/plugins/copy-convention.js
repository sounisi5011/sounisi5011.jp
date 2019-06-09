const path = require('path');

const pluginKit = require('metalsmith-plugin-kit');

function isValidPath(filepath) {
  if (typeof filepath === 'string') {
    return /(?:^|[/\\])[^/\\]*[^/\\.][^/\\]*$/.test(filepath);
  }
  return false;
}

module.exports = opts => {
  const options = {
    override: false,
    pattern: ['**/*.copy'],
    renamer: filename => filename.replace(/(?<=[^/\\])\.copy$/, ''),
    ...opts,
  };

  return pluginKit.middleware({
    each: (filename, file, files, metalsmith) => {
      const newFilename = options.renamer(filename);
      if (
        isValidPath(file.source) &&
        (options.override || !files.hasOwnProperty(newFilename))
      ) {
        const sourceFullpath = metalsmith.path(
          metalsmith.source(),
          path.dirname(filename),
          file.source,
        );

        return new Promise(resolve => {
          metalsmith.readFile(sourceFullpath, (err, fileData) => {
            if (err) {
              throw err;
            }

            delete file.source;
            const newFileData = { ...file, ...fileData };

            files[newFilename] = newFileData;
            delete files[filename];

            resolve();
          });
        });
      }
    },
    match: options.pattern,
  });
};
