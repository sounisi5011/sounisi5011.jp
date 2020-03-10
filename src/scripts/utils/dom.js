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
  if (
    typeof attrs !== 'object' ||
    !attrs ||
    Array.isArray(attrs) ||
    attrs instanceof Node
  ) {
    children = [].concat(attrs, children);
    attrs = {};
  }

  tagName = tagName.replace(/\.([^.]+)/g, (_, className) => {
    attrs.className = attrs.className
      ? `${String(attrs.className).trim()} ${className}`
      : className;
    return '';
  });

  const elem = document.createElement(tagName);
  setAttr(elem, attrs);
  children.forEach(childNode => {
    if (typeof childNode === 'function') {
      childNode = childNode(elem);
    }
    if (childNode !== undefined && childNode !== null) {
      elem.append(childNode);
    }
  });
  return elem;
}

/**
 * @param {Node} parentNode
 */
export function removeChildren(parentNode) {
  let firstChild;
  while ((firstChild = parentNode.firstChild)) {
    parentNode.removeChild(firstChild);
  }
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

export function throttle(conv, fn = null) {
  if (!fn) {
    fn = conv;
    conv = (...args) => args;
  }

  let isRunning = false;
  let argsCache = [];

  const reqAnimateFn = () => {
    fn.apply(...argsCache);
    isRunning = false;
  };

  return function(...args) {
    argsCache = [this, [].concat(conv.apply(this, args))];
    if (!isRunning) {
      isRunning = true;
      requestAnimationFrame(reqAnimateFn);
    }
  };
}

/**
 * @param {string} filename
 * @param {string} filedata
 */
export function saveText(filename, filedata) {
  const filedataBlob = new Blob([filedata], { type: 'text/plain' });
  const filedataBlobURL = URL.createObjectURL(filedataBlob);
  const aElem = h('a', {
    href: filedataBlobURL,
    download: filename,
  });
  aElem.click();

  /**
   * Note: setTimeout()を使用しなくてもChromeでは動作し、
   *       仕様書にも「Requests that were started before the url was revoked should still succeed」と記載があるが、
   *       念の為blob URLを開放する処理は10秒後に行う。
   * @see https://w3c.github.io/FileAPI/#dfn-revokeObjectURL
   */
  setTimeout(() => URL.revokeObjectURL(filedataBlobURL), 10 * 1000);
}
