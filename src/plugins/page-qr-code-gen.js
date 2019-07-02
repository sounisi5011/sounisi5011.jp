const path = require('path');

const pluginKit = require('metalsmith-plugin-kit');
const QRCode = require('qrcode');

const { sha1 } = require('../utils/hash');
const { canonicalURL } = require('../utils/template-functions');

const URL_REGEXP = /^(?:https?:)?[/]{2}/;

module.exports = opts => {
  const options = {
    destDir: 'qr',
    pattern: ['**/*.html'],
    rootURL: 'rootURL',
    ...opts,
  };

  const qrCodeOptions = {
    scale: 1,
  };

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const filePath = file.hasOwnProperty('path') ? file.path : filename;
      const rootURL = URL_REGEXP.test(options.rootURL)
        ? options.rootURL
        : metalsmith.metadata()[options.rootURL];
      const pageURL = canonicalURL(rootURL, filePath);
      const qrCodePrefix = path.join(options.destDir, sha1(filePath));

      await Promise.all(
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
        }),
      );
    },
    match: options.pattern,
  });
};
