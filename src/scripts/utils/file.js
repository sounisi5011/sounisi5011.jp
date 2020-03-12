/**
 * @param {Blob} blob
 * @returns {Promise.<string>}
 */
export function file2Text(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error);
      reader.abort();
    };
    reader.onabort = () => {
      reject(reader.error);
    };
    /**
     * Note: readAsText()メソッドの呼び出しを非同期にしないと、UIスレッドがブロックされ、描画が更新されない。
     */
    requestAnimationFrame(() => {
      reader.readAsText(blob);
    });
  });
}
