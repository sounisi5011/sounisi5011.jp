const { convert } = require('convert-svg-to-png');
const pluginKit = require('metalsmith-plugin-kit');

function getSourceFullpath(metalsmith, filename) {
  return metalsmith.path(metalsmith.source(), filename);
}

module.exports = opts => {
  const options = {
    override: false,
    pattern: ['**/*.png.svg'],
    renamer: filename =>
      filename.replace(/(?<=[^/\\])(?:\.png)?\.svg$/, '.png'),
    ...opts,
  };

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const newFilename = options.renamer(filename);

      if (
        options.override ||
        (filename !== newFilename && !files.hasOwnProperty(newFilename))
      ) {
        const svgData = file.contents.toString();

        const pngData = await convert(svgData, {
          baseFile: getSourceFullpath(metalsmith, filename),
          puppeteer: { args: ['--allow-file-access-from-files'] },
        });

        file.contents = pngData;

        files[newFilename] = file;
        delete files[filename];
      }
    },
    match: options.pattern,
  });
};
