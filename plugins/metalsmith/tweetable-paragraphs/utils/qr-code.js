const QRCode = require('qrcode');

const { sortProps } = require('.');

/**
 * @param {string} text
 */
exports.toBuffer = async (text, options = {}) => {
  options = sortProps(options);

  const cacheKey = JSON.stringify({ text, options });
  const cachedBuffer = qrCodeBufferCacheMap.get(cacheKey);
  if (cachedBuffer) return cachedBuffer;

  const qrCodeBuffer = await QRCode.toBuffer(text, options);

  qrCodeBufferCacheMap.set(cacheKey, qrCodeBuffer);
  return qrCodeBuffer;
};

/** @type {Map.<string, Buffer>} */
const qrCodeBufferCacheMap = new Map();
