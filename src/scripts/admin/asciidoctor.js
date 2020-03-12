import AsciidoctorWorker from 'web-worker:./asciidoctor.worker.js';

/**
 * @typedef {function({ title:(string|null), html:string }):void} ProcessedFn
 * @type {ProcessedFn}
 */
let onProcessedFn = () => {};

/** @type {Worker} */
const asciidoctorWorker = AsciidoctorWorker();
/**
 * 変換を指定された入力
 * @type {string|null}
 */
let processingInput = null;
/**
 * Workerが実行中の場合はtrue
 */
let isProcessing = false;

asciidoctorWorker.addEventListener('message', event => {
  const { input, title, html } = event.data;

  /*
   * 指定された入力が処理開始時と異なっていた場合は、再度処理を開始する
   */
  if (input !== processingInput) {
    asciidoctorWorker.postMessage({
      input: processingInput,
    });
    return;
  }

  /*
   * フラグ変数をリセット
   * Note: processingInput変数へnullを代入する必要は無いが、長い文字列をメモリから開放するために上書き
   */
  processingInput = null;
  isProcessing = false;

  /*
   * 登録済みのコールバック関数を呼び出す
   */
  onProcessedFn({ title, html });
});

/**
 * 属性値をエスケープする
 * @param {string} value
 * @returns {string}
 * @see https://asciidoctor.org/docs/user-manual/#setting-attributes-on-an-element
 */
export function escapeAttrValue(value) {
  if (!/[\s,"'"]/.test(value)) {
    return value;
  }
  if (value.includes(`"`) && !value.includes(`'`)) {
    return `'${value}'`;
  }
  return `"${value.replace(/"/g, `\\"`)}"`;
}

/**
 * @param {string} macroName
 * @param {string} target
 * @param {string[]} positionalAttrs
 * @param {Object.<string, string|false|null|undefined>} attrs
 * @returns {string}
 * @see https://asciidoctor.org/docs/user-manual/#setting-attributes-on-an-element
 */
export function createInlineMacroText(
  macroName,
  target = '',
  positionalAttrs = [],
  attrs = {},
) {
  const attrStrList = positionalAttrs.map(escapeAttrValue).concat(
    Object.entries(attrs)
      .filter(
        ([, value]) => value !== false && value !== null && value !== undefined,
      )
      .map(([name, value]) => `${name}=${escapeAttrValue(value)}`),
  );
  return `${macroName}:${target}[${attrStrList
    .join(', ')
    .replace(/\[/g, `\\[`)}]`;
}

/**
 * @typedef {{ macroName:string, target:string, positionalAttrs:(string|null)[], attrs:Object.<string, string> }} InlineMacroData
 * @param {string} text
 * @param {string[]} positionalAttrNames
 * @returns {InlineMacroData|null}
 */
export function parseInlineMacroText(text, positionalAttrNames = []) {
  const match = /^([a-z]+):([^[\r\n]+)\[((?:\\]|[^\]\r\n])*)\]$/i.exec(text);
  if (!match) return null;

  const [, macroName, target, attrsText] = match;

  const attrsRegExp = /\s*(?:([^=,\s]+)\s*=)?\s*(?:"((?:\\"|[^"])*)"|'((?:\\'|[^'])*)'|\s*([^,]*))\s*(?:,\s*|$)/y;
  const positionalAttrs = [];
  const attrs = {};
  for (let match; (match = attrsRegExp.exec(attrsText)); ) {
    if (match.index === attrsText.length) break;
    const [, attrName, quotValue, aposValue, rawValue] = match;
    const value = (
      rawValue ||
      (aposValue && aposValue.replace(/\\'/, `'`)) ||
      (quotValue && quotValue.replace(/\\"/, `"`)) ||
      ''
    ).replace(/\\]/, ']');
    if (attrName) {
      attrs[attrName] = value;
      positionalAttrs.push(null);
    } else {
      const attrName = positionalAttrNames[positionalAttrs.length];
      if (attrName !== undefined) {
        attrs[attrName] = value;
      }
      positionalAttrs.push(value);
    }
  }

  return {
    macroName,
    target,
    positionalAttrs,
    attrs,
  };
}

export default {
  /**
   * Asciidoctorの処理を開始する
   * @param {string} inputText
   */
  convert(inputText) {
    processingInput = inputText;

    /*
     * Workerが実行中ではない場合は、処理を開始する
     */
    if (!isProcessing) {
      isProcessing = true;
      asciidoctorWorker.postMessage({
        input: inputText,
      });
    }
  },

  /**
   * Asciidoctorの処理完了時に実行するコールバック関数を登録する
   * @param {ProcessedFn} fn
   */
  onProcessed(fn) {
    if (typeof fn === 'function') {
      onProcessedFn = fn;
    }
  },
};
