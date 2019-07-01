const crypto = require('crypto');

const algorithms = crypto
  .getHashes()
  .filter(algorithm => /^(?:md5|sha[0-9]+)$/.test(algorithm));

algorithms.forEach(algorithm => {
  exports[algorithm] = text => {
    return crypto
      .createHash(algorithm)
      .update(text)
      .digest('hex');
  };
});
