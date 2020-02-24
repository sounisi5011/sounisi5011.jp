const { KEY_LENGTH } = require('./encrypt');

function trimRightSlash(urlOrFunc) {
  if (typeof urlOrFunc === 'function') {
    return function(...args) {
      const retval = urlOrFunc.apply(this, args);
      return typeof retval === 'string' ? retval.replace(/\/+$/, '') : retval;
    };
  }
  return trimRightSlash(() => urlOrFunc)();
}

exports.initOptions = opts => {
  const options = {
    wordLength: 4,
    wordPrefix: '',
    urlListFilename: '_url-shortener-defs',
    encryptKeyEnvName: 'METALSMITH_URL_SHORTENER_ENCRYPT_KEY',
    /** @see https://docs.netlify.com/configure-builds/environment-variables/#deploy-urls-and-metadata */
    rootURL: process.env.URL,
    rootURLShrinker: rootURL => rootURL,
    redirectsReplaceLine: '# url-shortener redirect paths #',
    ...opts,
  };
  options.rootURL = trimRightSlash(options.rootURL);
  options.rootURLShrinker = trimRightSlash(options.rootURLShrinker);

  const encryptKeyStr = process.env[options.encryptKeyEnvName];
  if (!encryptKeyStr)
    throw new Error(`環境変数 ${options.encryptKeyEnvName} を設定してください`);
  const encryptKey = ['hex', 'base64']
    .map(encoding => Buffer.from(encryptKeyStr, encoding))
    .find(buf => buf.length === KEY_LENGTH);
  if (!encryptKey)
    throw new Error(
      `環境変数 ${options.encryptKeyEnvName} の値は${KEY_LENGTH}bytesのバイナリデータをHexまたはBase64で表した値である必要があります`,
    );

  return { options, encryptKey };
};
