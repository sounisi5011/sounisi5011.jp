const { convert } = require('convert-svg-to-png');
const pluginKit = require('metalsmith-plugin-kit');
const toIco = require('to-ico');

const ICO_IMAGE_SIZES = [16, 24, 32, 48, 64, 128, 256];

function getSourceFullpath(metalsmith, filename) {
  return metalsmith.path(metalsmith.source(), filename);
}

module.exports = opts => {
  const options = {
    override: false,
    pattern: ['**/*.ico.svg'],
    renamer: filename =>
      filename.replace(/(?<=[^/\\])(?:\.ico)?\.svg$/, '.ico'),
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

        const sourceFileFullpath = getSourceFullpath(metalsmith, filename);
        const pngDataList = await Promise.all(
          ICO_IMAGE_SIZES.map(size =>
            convert(svgData, {
              baseFile: sourceFileFullpath,
              height: size,
              puppeteer: { args: ['--allow-file-access-from-files'] },
              width: size,
            }),
          ),
        );
        const icoData = await toIco(pngDataList);

        file.contents = icoData;

        files[newFilename] = file;
        delete files[filename];
      }
    },
    match: options.pattern,
  });
};
