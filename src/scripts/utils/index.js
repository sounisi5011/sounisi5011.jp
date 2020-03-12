/**
 * @param {Object} obj
 * @param {string|symbol} prop
 * @returns {PropertyDescriptor}
 */
export function getPrototypePropertyDescriptor(obj, prop) {
  let proto = obj;
  let desc;
  do {
    desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  } while (proto);
  return desc;
}

/**
 * @param {Object} obj
 * @param {string|symbol} prop
 * @param {function(*):void} hook
 */
export function setterHook(obj, prop, hook) {
  const desc = getPrototypePropertyDescriptor(obj, prop);
  if (typeof desc.set !== 'function') {
    throw new Error(`プロパティ ${prop} はsetterを有していません`);
  }
  Object.defineProperty(obj, prop, {
    ...desc,
    get: desc.get,
    set(value) {
      hook.call(this, value);
      desc.set.call(this, value);
    },
  });
  return obj;
}
