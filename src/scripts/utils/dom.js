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
      if (typeof attrValue === 'object' && attrValue) {
        Object.assign(elem[attrName], attrValue);
      } else {
        elem[attrName] = attrValue;
      }
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

/**
 * @param {Node} targetNode
 * @param {Element} wrapperElem
 * @see https://stackoverflow.com/a/57377341/4907315
 */
export function wrap(targetNode, wrapperElem) {
  const { parentNode } = targetNode;
  if (parentNode) {
    parentNode.insertBefore(wrapperElem, targetNode);
  }
  wrapperElem.appendChild(targetNode);
  return wrapperElem;
}

export function maxScroll(docOrElem) {
  if (docOrElem instanceof Document) {
    const scrollingElement = docOrElem.scrollingElement;
    return maxScroll(scrollingElement);
  }

  return {
    /**
     * @see https://qiita.com/sounisi5011/items/1a5a2410fce27ba6d8ae#%E5%8F%B3%E3%81%8B%E3%82%89%E3%81%AE%E3%82%B9%E3%82%AF%E3%83%AD%E3%83%BC%E3%83%AB%E9%87%8F
     */
    get left() {
      return docOrElem.scrollWidth - docOrElem.clientWidth;
    },
    /**
     * @see https://qiita.com/sounisi5011/items/1a5a2410fce27ba6d8ae#%E4%B8%8B%E3%81%8B%E3%82%89%E3%81%AE%E3%82%B9%E3%82%AF%E3%83%AD%E3%83%BC%E3%83%AB%E9%87%8F
     */
    get top() {
      return docOrElem.scrollHeight - docOrElem.clientHeight;
    },
  };
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
