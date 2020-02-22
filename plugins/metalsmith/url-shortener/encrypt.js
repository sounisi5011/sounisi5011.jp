/**
 * @see https://blog.manabusakai.com/2016/06/ansible-vault/
 * @see https://qiita.com/hm0429/items/2acee723170b32b91304
 * @see https://qiita.com/shoichi0599/items/6082b765c1257b71985b
 * @see https://qiita.com/liveasnotes/items/a5e35419242883029e25
 * @see https://www.kwbtblog.com/entry/2019/07/19/155421
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-ctr';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

exports.KEY_LENGTH = KEY_LENGTH;

/**
 * @param {Buffer} key
 * @param {string} data
 */
exports.encryptToFileData = (
  key,
  data,
  { algorithm = ALGORITHM, iv = crypto.randomBytes(IV_LENGTH) } = {},
) => {
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  const algorithmData = Buffer.from(ALGORITHM);
  const encryptedFileData = Buffer.concat([
    Buffer.from([algorithmData.length, iv.length]),
    algorithmData,
    iv,
    cipher.update(data),
    cipher.final(),
  ]);
  return encryptedFileData;
};

/**
 * @param {Buffer} key
 * @param {Buffer} encryptedFileData
 */
exports.decryptFromFileData = (key, encryptedFileData) => {
  let index = 0;
  const algorithmLength = encryptedFileData[index];
  const ivLength = encryptedFileData[++index];
  const algorithmData = encryptedFileData.subarray(
    ++index,
    (index += algorithmLength),
  );
  const iv = encryptedFileData.subarray(index, (index += ivLength));
  const encryptedData = encryptedFileData.subarray(index);

  const decipher = crypto.createDecipheriv(algorithmData.toString(), key, iv);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
};
