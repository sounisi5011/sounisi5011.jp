/* global Promise, System */

// Note: 圧縮率を上げるため、意図的にletキーワードを多用している。

{
  let self = window;
  let doc = document;
  let systemJsUrl = self.__SYSTEM_JS_URL__;

  /** @type {string[][]} */
  let srcList = [];
  /** @param {string[]} syncSrcList */
  let loadSystemJsScripts = function(syncSrcList) {
    loadSystemJsScripts = function(syncSrcList) {
      srcList.push(syncSrcList);
    };
    loadSystemJsScripts(syncSrcList);

    if (
      typeof Promise !== 'function' ||
      typeof Promise.prototype.finally !== 'function'
    ) {
      importScript(self.__PROMISE_POLYFILL_URL__, function() {
        importScript(systemJsUrl, init);
      });
    } else {
      importScript(systemJsUrl, init);
    }
  };
  self.__SYSTEM_JS_LOADER__ = function(syncSrcList) {
    loadSystemJsScripts(syncSrcList);
  };

  let importScript = function(jspath, callback) {
    let jsLoaderElem = doc.createElement('script');
    jsLoaderElem.addEventListener('load', callback);
    jsLoaderElem.src = jspath;
    doc.head.appendChild(jsLoaderElem);
  };

  let init = function() {
    srcList.forEach(
      (loadSystemJsScripts = function(syncSrcList) {
        let promise;
        syncSrcList.forEach(function(src) {
          if (!promise) {
            promise = System.import(src);
          } else {
            promise = promise.then(function() {
              return System.import(src);
            });
          }
        });
      }),
    );
  };

  if (!self.__SUPPORTS_DYNAMIC_IMPORT__) {
    /* __JS_SRC_LIST:loop:start__ */
    loadSystemJsScripts(self.__JS_SRC_LIST__);
    /* __JS_SRC_LIST:loop:end__ */
  }
}
