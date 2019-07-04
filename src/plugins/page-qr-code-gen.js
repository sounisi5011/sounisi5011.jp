const path = require('path');

const sizeOf = require('image-size');
const pluginKit = require('metalsmith-plugin-kit');
const QRCode = require('qrcode');

const { sha1 } = require('../utils/hash');

module.exports = opts => {
  const options = {
    destDir: 'qr',
    pageURL: 'URL',
    pattern: ['**/*.html'],
    qrCodeImagesProp: 'qrCodeImageFiles',
    ...opts,
  };

  if (typeof options.pageURL !== 'function') {
    const pageURLKey = String(options.pageURL);
    options.pageURL = (filename, file, files, metalsmith) => {
      return file[pageURLKey];
    };
  }

  const qrCodeOptions = {
    scale: 1,
  };

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const filePath = file.hasOwnProperty('path') ? file.path : filename;
      const pageURL = options.pageURL(filename, file, files, metalsmith);
      if (!pageURL) {
        return;
      }

      const qrCodePrefix = path.join(options.destDir, sha1(filePath));

      const qrCodeFiles = await Promise.all(
        [
          // Generate SVG
          ['svg', QRCode.toString],
          // Generate PNG
          ['png', QRCode.toBuffer],
        ].map(async ([filetype, contentGenerator]) => {
          const filename = `${qrCodePrefix}.${filetype}`;
          const content = await contentGenerator(pageURL, {
            ...qrCodeOptions,
            type: filetype,
          });
          pluginKit.addFile(files, filename, content);
          const filedata = files[filename];
          const dimensions = sizeOf(filedata.contents);
          return [
            filetype,
            Object.assign(filedata, {
              path: filename,
              ...dimensions,
            }),
          ];
        }),
      );

      if (options.qrCodeImagesProp) {
        file[options.qrCodeImagesProp] = qrCodeFiles.reduce(
          (obj, [filetype, fileData]) => {
            obj[filetype] = fileData;
            return obj;
          },
          {},
        );
      }
    },
    match: options.pattern,
  });
};
