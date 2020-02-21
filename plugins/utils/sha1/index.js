const crypto = require('crypto');

module.exports = function sha1(data) {
  return crypto
    .createHash('sha1')
    .update(data)
    .digest('hex');
};
