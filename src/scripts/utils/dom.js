export function setAttr(elem, attrs) {
  for (const [attrName, attrValue] of Object.entries(attrs)) {
    if (
      /^on[A-Z]/.test(attrName) &&
      (typeof attrValue === 'function' ||
        (Array.isArray(attrValue) && typeof attrValue[0] === 'function'))
    ) {
      const eventType = attrName.substring(2).toLowerCase();
      if (Array.isArray(attrValue)) {
        elem.addEventListener(eventType, ...attrValue);
      } else {
        elem.addEventListener(eventType, attrValue);
      }
    } else if (attrName in elem) {
      elem[attrName] = attrValue;
    } else {
      if (attrValue === null || attrValue === undefined) {
        elem.removeAttribute(attrName);
      } else {
        elem.setAttribute(attrName, attrValue);
      }
    }
  }
  return elem;
}

export function h(tagName, attrs = {}, children = []) {
  if (!Array.isArray(children)) {
    children = [children];
  }
  if (Array.isArray(attrs)) {
    children = attrs.concat(children);
    attrs = {};
  }

  const elem = document.createElement(tagName);
  setAttr(elem, attrs);
  children.forEach(childNode => {
    if (typeof childNode === 'function') {
      childNode = childNode(elem);
    }
    if (childNode instanceof Node) {
      elem.appendChild(childNode);
    } else if (elem !== undefined && elem !== null) {
      elem.appendChild(document.createTextNode(childNode));
    }
  });
  return elem;
}

export function throttle(fn) {
  let isRunning = false;
  let argsCache = [];

  const reqAnimateFn = () => {
    fn(...argsCache);
    isRunning = false;
  };

  return (...args) => {
    argsCache = args;
    if (!isRunning) {
      isRunning = true;
      requestAnimationFrame(reqAnimateFn);
    }
  };
}
