/**
 * @see https://blog.manabusakai.com/2016/06/ansible-vault/
 * @see https://qiita.com/hm0429/items/2acee723170b32b91304
 * @see https://qiita.com/shoichi0599/items/6082b765c1257b71985b
 * @see https://qiita.com/liveasnotes/items/a5e35419242883029e25
 * @see https://www.kwbtblog.com/entry/2019/07/19/155421
 * @see https://qiita.com/asksaito/items/130863fe9e6a08dcd65d
 * @see https://jovi0608.hatenablog.com/entry/20160404/1459748671
 * @see https://crypto.stackovernet.com/ja/q/11505
 * @see https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81
 * @see https://qiita.com/asksaito/items/1793b8d8b3069b0b8d68
 * @see https://github.com/sylph01/tokyoex_encryption_with_elixir/blob/master/encryption_with_elixir.md
 * @see https://scrapbox.io/nwtgck/AES-GCM%E3%81%AE%E5%88%9D%E6%9C%9F%E5%8C%96%E3%83%99%E3%82%AF%E3%83%88%E3%83%ABIV%E3%81%AF12%E3%83%90%E3%82%A4%E3%83%88%E3%81%8C%E6%8E%A8%E5%A5%A8
 */

const crypto = require('crypto');
const util = require('util');
const zlib = require('zlib');

const { DataChunk } = require('./binary-file-utils');

/*
 * 拡張データのチャンクタイプを定義
 * Note: 後方互換性を維持するため、既存の値は編集しないでください。
 */
const chunkTypeRecord = {
  authTag: 0x00,
  authTagLen: 0x01,
  compressType: 0x10,
};

/*
 * 圧縮アルゴリズムの一覧を定義
 * Note: 後方互換性を維持するため、既存の値は編集しないでください。
 */
const compresserRecord = {
  deflate: {
    type: 0x01,
    compress: util.promisify(zlib.deflate),
    decompress: util.promisify(zlib.inflate),
  },
  deflateRaw: {
    type: 0x02,
    compress: util.promisify(zlib.deflateRaw),
    decompress: util.promisify(zlib.inflateRaw),
  },
  gzip: {
    type: 0x03,
    compress: util.promisify(zlib.gzip),
    decompress: util.promisify(zlib.gunzip),
  },
  brotli: {
    type: 0x04,
    compress: util.promisify(zlib.brotliCompress),
    decompress: util.promisify(zlib.brotliDecompress),
  },
};

/**
 * @see https://tools.ietf.org/html/rfc8103#section-1.1
 * @see https://tools.ietf.org/html/rfc7539#section-2.4
 */
const KEY_LENGTH = 256 / 8;

exports.KEY_LENGTH = KEY_LENGTH;

/*
 * 使用する暗号化アルゴリズムを定義
 * 認証付き暗号を使用する。
 */
const supportedAlgorithmList = crypto.getCiphers();
const algorithm = ['chacha20-poly1305', 'aes-256-gcm'].find(algorithm =>
  supportedAlgorithmList.includes(algorithm),
);

/**
 * @param {Buffer} key
 * @param {string} data
 */
exports.encryptToFileData = async (key, data) => {
  /**
   * @see https://nodejs.org/api/crypto.html#crypto_ccm_mode
   * @see https://scrapbox.io/nwtgck/AES-GCM%E3%81%AE%E5%88%9D%E6%9C%9F%E5%8C%96%E3%83%99%E3%82%AF%E3%83%88%E3%83%ABIV%E3%81%AF12%E3%83%90%E3%82%A4%E3%83%88%E3%81%8C%E6%8E%A8%E5%A5%A8
   * @see https://tools.ietf.org/html/rfc7539#section-2.4
   */
  const iv = crypto.randomBytes(96 / 8);
  /**
   * @see https://nodejs.org/api/crypto.html#crypto_ccm_mode
   * @see https://tools.ietf.org/html/rfc8103#section-1.1
   */
  const authTagLength = 16;

  /*
   * データを圧縮
   * ネットワークリクエストの負荷を回避するため、元のデータを圧縮する。
   */
  const compresser = compresserRecord.brotli;
  const compressedData = await compresser.compress(data);

  /*
   * 暗号化
   */
  const cipher = crypto.createCipheriv(algorithm, key, iv, { authTagLength });
  const encryptedDataPart1 = cipher.update(compressedData);
  const encryptedDataPart2 = cipher.final();

  /*
   * 拡張データを作成
   */
  const extensionData = new DataChunk(chunkTypeRecord);
  extensionData.setInt('compressType', compresser.type);
  extensionData.setInt('authTagLen', authTagLength);
  try {
    const authTag = cipher.getAuthTag();
    extensionData.setBuffer('authTag', authTag);
  } catch (error) {
    if (
      !(
        error.code === 'ERR_CRYPTO_INVALID_STATE' &&
        error.message === 'Invalid state for operation getAuthTag'
      )
    ) {
      throw error;
    }
  }

  /*
   * 暗号化データをファイル用の形式に変換
   */
  const algorithmData = Buffer.from('\x00' + algorithm);
  const encryptedFileData = Buffer.concat([
    Buffer.from([algorithmData.length, iv.length]),
    algorithmData,
    iv,
    extensionData.toBuffer(),
    encryptedDataPart1,
    encryptedDataPart2,
  ]);
  return encryptedFileData;
};

/**
 * @param {Buffer} key
 * @param {Buffer} encryptedFileData
 */
exports.decryptFromFileData = async (key, encryptedFileData) => {
  let index = 0;

  /*
   * 暗号化アルゴリズムとIVのデータ長を読み取る
   */
  const algorithmLength = encryptedFileData[index];
  const ivLength = encryptedFileData[++index];

  /*
   * 暗号化アルゴリズムを読み取る
   */
  const algorithmData = encryptedFileData.subarray(
    ++index,
    (index += algorithmLength),
  );
  let algorithm = '';
  let allowExtension = false;
  if (algorithmData[0] === 0x00) {
    /*
     * 先頭が0x00の場合は、拡張データを含むものとして処理する
     */
    algorithm = algorithmData.subarray(1).toString();
    allowExtension = true;
  } else {
    algorithm = algorithmData.toString();
  }

  /*
   * IVを読み取る
   */
  const iv = encryptedFileData.subarray(index, (index += ivLength));

  /*
   * 拡張データを読み取る
   */
  let extensionData = new DataChunk(chunkTypeRecord);
  if (allowExtension) {
    extensionData = new DataChunk(chunkTypeRecord, encryptedFileData, index);
    index += extensionData.toBuffer().length;
  }

  /*
   * 暗号データを読み取る
   */
  const encryptedData = encryptedFileData.subarray(index);

  /*
   * 復号のオプションを設定
   */
  const options = {};
  {
    const authTagLength = extensionData.getInt('authTagLen');
    if (typeof authTagLength === 'number')
      options.authTagLength = authTagLength;
  }

  /*
   * 復号
   */
  const decipher = crypto.createDecipheriv(algorithm, key, iv, options);
  {
    const authTag = extensionData.getBuffer('authTag');
    if (authTag) decipher.setAuthTag(authTag);
  }
  const data = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  /*
   * 指定された圧縮アルゴリズムでデータを解凍
   */
  const compresserType = extensionData.getInt('compressType');
  const compresser = Object.values(compresserRecord).find(
    ({ type }) => compresserType === type,
  );
  if (compresser) {
    return compresser.decompress(data);
  }

  return data;
};
