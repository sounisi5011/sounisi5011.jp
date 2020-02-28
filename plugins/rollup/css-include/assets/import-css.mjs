/**
 * @see https://qiita.com/rana_kualu/items/95a7adf8420ea2b9f657
 * @see https://www.filamentgroup.com/lab/load-css-simpler/
 */

const linkElemTemplate = document.createElement('link');
linkElemTemplate.rel = 'stylesheet';
// linkElem.type = 'text/css';
linkElemTemplate.media = 'print';

function importCSS(src) {
  return new Promise((resolve, reject) => {
    const linkElem = linkElemTemplate.cloneNode();
    linkElem.onload = () => {
      resolve({
        linkElem,
        init() {
          linkElem.media = 'all';
        },
      });
    };
    linkElem.onerror = error => {
      reject(
        new URIError(
          `Cannot import style '${(error && error.target && error.target.src) ||
            src}'`,
        ),
      );
    };
    linkElem.href = src;
    document.head.appendChild(linkElem);
  });
}

export default src => {
  // Note: このコードにURLクラスは全く必要ないが、RollupのファイルURL参照には必要なため、
  //       ここで使用し、@babel/preset-envにPolyfillを挿入させる。
  const loader = importCSS(new URL(src).href);
  return () =>
    loader.then(({ init, ...other }) => {
      init();
      return other;
    });
};
