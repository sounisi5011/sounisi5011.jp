const pluginKit = require('metalsmith-plugin-kit');
const Mustache = require('mustache');

module.exports = opts => {
  const options = {
    pattern: ['**/*.mustache'],
    renamer: filename => filename.replace(/(?<=.)\.mustache$/, ''),
    ...opts,
  };

  return pluginKit.middleware({
    each: (filename, file, files, metalsmith) => {
      const metadata = metalsmith.metadata();
      const newFilename = options.renamer(filename);
      const locals = { ...metadata, ...file };

      const templateText = file.contents.toString();
      const compiledText = Mustache.render(templateText, locals);

      file.contents = Buffer.from(compiledText);

      if (filename !== newFilename && !files.hasOwnProperty(newFilename)) {
        delete files[filename];
        files[newFilename] = file;
      }
    },
    match: options.pattern,
  });
};
