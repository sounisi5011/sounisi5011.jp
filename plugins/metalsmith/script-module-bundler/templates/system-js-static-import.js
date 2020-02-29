/* global Promise, System */

// Note: 圧縮率を上げるため、意図的にletキーワードを多用している。

{
  let doc = document;
  let systemJsUrl = window.__SYSTEM_JS_URL__;

  let init = function() {
    /* __JS_SRC_LIST:loop:start__ */
    /* __JS_SRC_LIST:head:start__ */
    System.import(window.__JS_SRC__)
      /* __JS_SRC_LIST:head:end__ */
      /* __JS_SRC_LIST:tail:start__ */
      .then(function() {
        return System.import(window.__JS_SRC__);
      }) /* prettier-ignore */
    /* __JS_SRC_LIST:tail:end__ */
    ; /* prettier-ignore */
    /* __JS_SRC_LIST:loop:end__ */
  };

  let importScript = function(jspath, callback) {
    let jsLoaderElem = doc.createElement('script');
    jsLoaderElem.addEventListener('load', callback);
    jsLoaderElem.src = jspath;
    doc.head.appendChild(jsLoaderElem);
  };

  if (
    typeof Promise !== 'function' ||
    typeof Promise.prototype.finally !== 'function'
  ) {
    importScript(window.__PROMISE_POLYFILL_URL__, function() {
      importScript(systemJsUrl, init);
    });
  } else {
    importScript(systemJsUrl, init);
  }
}
