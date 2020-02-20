/**
 * OS XのファイルシステムHFS+により行われるファイルパスのUnicode正規化を修正する
 * @see https://tama-san.com/hfsplus/
 * @see https://blog.sarabande.jp/post/52532110572
 */

const IS_MAC_OS = process.platform === 'darwin';

/**
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str.replace(
    /[^\u{2000}-\u{2FFF}\u{F900}-\u{FAFF}\u{2F800}-\u{2FAFF}]+/u,
    str => str.normalize('NFC'),
  );
}

module.exports = () => {
  return (files, metalsmith, done) => {
    if (IS_MAC_OS) {
      Object.keys(files).forEach(originalFilename => {
        const normalizedFilename = normalize(originalFilename);
        if (
          originalFilename !== normalizedFilename &&
          !Object.prototype.hasOwnProperty.call(files, normalizedFilename)
        ) {
          const desc = Object.getOwnPropertyDescriptor(files, originalFilename);
          delete files[originalFilename];
          Object.defineProperty(files, normalizedFilename, desc);
        }
      });
    }
    done();
  };
};
