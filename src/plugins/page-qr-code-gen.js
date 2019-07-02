const path = require('path');

const pluginKit = require('metalsmith-plugin-kit');
const QRCode = require('qrcode');

const { sha1 } = require('../utils/hash');

module.exports = opts => {
  const options = {
    destDir: 'qr',
    pageURL: 'URL',
    pattern: ['**/*.html'],
    qrCodeImagesProp: 'qrCodeImageFileList',
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
          [
            `${qrCodePrefix}.svg`,
            QRCode.toString(pageURL, { ...qrCodeOptions, type: 'svg' }),
          ],
          // Generate PNG
          [
            `${qrCodePrefix}.png`,
            QRCode.toBuffer(pageURL, { ...qrCodeOptions, type: 'png' }),
          ],
        ].map(async ([filename, content]) => {
          pluginKit.addFile(files, filename, await content);
          const filedata = files[filename];
          return Object.assign(filedata, {
            path: filename,
          });
        }),
      );

      if (options.qrCodeImagesProp) {
        file[options.qrCodeImagesProp] = qrCodeFiles;
      }
    },
    match: options.pattern,
  });
};
