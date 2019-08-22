{
  const fragmentIdAttr = 'data-fragment-id';
  /** @see https://drafts.csswg.org/css-syntax-3/#string-token-diagram */
  const fragmentIdAttrSelectorRegExp = /\[data-fragment-id=(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/gm;

  function each(list, callback) {
    const len = list.length;
    for (let i = 0; i < len; i++) {
      callback(list[i], i, list);
    }
  }

  function reduce(list, callback, retval) {
    each(list, (value, index) => {
      retval = callback(retval, value, index, list);
    });
    return retval;
  }

  const cssEscape =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape
      : /** @see https://drafts.csswg.org/cssom/#serialize-an-identifier */
        str => {
          /**
           * @see https://drafts.csswg.org/cssom/#escape-a-character
           */
          function escape(char) {
            return '\\' + char[0];
          }

          /**
           * @see https://drafts.csswg.org/cssom/#escape-a-character-as-code-point
           */
          function codePointEscape(char) {
            return '\\' + char.charCodeAt(0).toString(16) + ' ';
          }

          return str.replace(
            // eslint-disable-next-line no-control-regex
            /[\u0000\u0001-\u001f\u007F]|^-?[0-9]|^-$|(?=[\u0000-\u007f])[^-_0-9a-zA-Z]/g,
            char => {
              if (char === '\u0000') {
                return '\uFFFD';
              }
              // eslint-disable-next-line no-control-regex
              if (/^[\u0001-\u001f\u007F0-9]$/.test(char)) {
                return codePointEscape(char);
              }
              if (/^-[0-9]/.test(char)) {
                return char[0] + codePointEscape(char[1]);
              }
              return escape(char);
            },
          );
        };

  function eachStyleSheet(callback, styleSheets = document.styleSheets) {
    each(styleSheets, sheet => {
      each(sheet.cssRules, rule => {
        if (callback(rule) !== false) {
          /**
           * @see https://lab.syncer.jp/Web/API_Interface/Reference/IDL/CSSImportRule/
           * @see https://drafts.csswg.org/cssom/#cssimportrule
           */
          if (rule.styleSheet) {
            eachStyleSheet(callback, [rule.styleSheet]);
          }

          /**
           * @see https://developer.mozilla.org/en-US/docs/Web/API/CSSGroupingRule
           */
          if (rule.cssRules) {
            eachStyleSheet(callback, [rule]);
          }
        }
      });
    });
  }

  function isIntersection(elem, { padding: { top = 0, bottom = 0 } } = {}) {
    const clientHeight = (elem.ownerDocument || document).documentElement
      .clientHeight;
    const rect = elem.getBoundingClientRect();
    const winTop = top;
    const winBottom = clientHeight - bottom;

    // see https://blog.jxck.io/entries/2016-06-25/intersection-observer.html#表示判定
    return (
      (winTop < rect.top && rect.top < winBottom) ||
      (winTop < rect.bottom && rect.bottom < winBottom) ||
      (rect.top < winTop && winBottom < rect.bottom)
    );
  }

  /**
   * @param {NodeList} nodeList
   * @param {function(Node): boolean} callback
   * @returns {Node|undefined}
   */
  function findElem(nodeList, callback) {
    const len = nodeList.length;
    for (let i = 0; i < len; i++) {
      const node = nodeList[i];
      if (callback(node)) {
        return node;
      }
    }
  }

  function findParentNode(node, callback, self = false) {
    if (self) {
      if (callback(node)) {
        return node;
      }
    }

    while ((node = node.parentNode)) {
      if (callback(node)) {
        return node;
      }
    }

    return null;
  }

  function getCanonicalURL(doc = document) {
    const linkElem = doc.querySelector('link[rel=canonical]');
    // TODO: hrefプロパティが古いブラウザでも使用できるなら、getAttribute()メソッドを削除する
    return linkElem.href || linkElem.getAttribute('href');
  }

  function prependClass(elem, className) {
    elem.className = className + ' ' + elem.className;
    return elem;
  }

  function createBottomFixedBoxElem(childrenCallback) {
    const outerElem = document.createElement('div');
    outerElem.className = 'bottom-fixed-box outer';

    const innerElem = document.createElement('div');
    innerElem.className = 'bottom-fixed-box inner';
    outerElem.appendChild(innerElem);

    const childrenList = childrenCallback(innerElem);
    each(childrenList, childNode => {
      innerElem.appendChild(childNode);
    });

    return outerElem;
  }

  function addDataAttr(rootNode, currentID = { value: '' }) {
    function wrap(el, wrapper) {
      el.parentNode.replaceChild(wrapper, el);
      wrapper.appendChild(el);
    }

    if (rootNode.nodeType !== rootNode.ELEMENT_NODE) {
      const wrapElem = rootNode.ownerDocument.createElement('span');
      wrapElem.setAttribute('role', 'presentation');
      if (currentID.value) {
        wrapElem.setAttribute(fragmentIdAttr, currentID.value);
      }
      wrap(rootNode, wrapElem);

      const dataset = {};
      dataset[currentID.value] = [wrapElem];
      return dataset;
    }

    if (rootNode.id) {
      currentID.value = rootNode.id;
    }

    if (!rootNode.querySelector('[id]')) {
      if (currentID.value) {
        rootNode.setAttribute(fragmentIdAttr, currentID.value);
      }

      const dataset = {};
      dataset[currentID.value] = [rootNode];
      return dataset;
    }

    return reduce(
      rootNode.childNodes,
      (obj, node) => {
        const dataset = addDataAttr(node, currentID);
        for (let id in dataset) {
          if (dataset.hasOwnProperty(id)) {
            if (obj[id]) {
              each(dataset[id], node => {
                obj[id].push(node);
              });
            } else {
              obj[id] = dataset[id];
            }
          }
        }
        return obj;
      },
      {},
    );
  }

  function share({ title = document.title, text, url }) {
    if (typeof navigator.share === 'function') {
      navigator.share({ text, title, url });
    } else {
      window.prompt('Share!', url);
    }
  }

  const canonicalURL = getCanonicalURL() || location.href.replace(/#.*$/, '');
  const htmlElem = document.documentElement;
  const headerElem = document.querySelector('header.page');
  const mainNovelElem = document.querySelector('.novel-body');
  const footerElem = document.querySelector('footer.page');

  addDataAttr(mainNovelElem);

  const shareAreaElem = createBottomFixedBoxElem(shareInnerAreaElem => {
    const shareButtonElem = document.createElement('button');
    shareButtonElem.className = 'share-button toggle-menu';
    shareButtonElem.textContent = '共有';
    shareButtonElem.addEventListener(
      'click',
      () => {
        if (htmlElem.classList.contains('share-open')) {
          htmlElem.classList.remove('share-open');
          shareButtonElem.textContent = '共有';
        } else {
          htmlElem.classList.add('share-open');
          shareButtonElem.textContent = '閉じる';
        }

        const currentParagraphElem = findElem(
          mainNovelElem.querySelectorAll('[' + cssEscape(fragmentIdAttr) + ']'),
          elem => {
            return isIntersection(elem, {
              padding: {
                bottom: footerElem.getBoundingClientRect().height,
                top: headerElem.getBoundingClientRect().height,
              },
            });
          },
        );
        const currentParagraphID = currentParagraphElem.getAttribute(
          fragmentIdAttr,
        );

        const fragment = '#' + encodeURIComponent(currentParagraphID);
        const url = canonicalURL + fragment;
        share({
          text: document
            .getElementById(currentParagraphID)
            .getAttribute('data-share-text'),
          url,
        });
      },
      false,
    );

    const paragraphShareAreaElem = createBottomFixedBoxElem(
      paragraphShareInnerAreaElem => {
        function replaceFragmentIdSelector(fragmentID) {
          const replaceSelector =
            '[' +
            cssEscape(fragmentIdAttr) +
            '="' +
            cssEscape(fragmentID) +
            '"]';
          eachStyleSheet(rule => {
            if (
              rule.selectorText &&
              fragmentIdAttrSelectorRegExp.test(rule.selectorText)
            ) {
              rule.selectorText = rule.selectorText.replace(
                fragmentIdAttrSelectorRegExp,
                replaceSelector,
              );
            }
          });
        }

        const paragraphSelectListener = event => {
          const targetParagraphElem = findParentNode(
            event.target,
            node =>
              typeof node.hasAttribute === 'function' &&
              node.hasAttribute(fragmentIdAttr),
            true,
          );
          const fragmentID = targetParagraphElem.getAttribute(fragmentIdAttr);
          replaceFragmentIdSelector(fragmentID);
        };

        const paragraphShareButtonElem = document.createElement('button');
        paragraphShareButtonElem.className = 'share-button paragraph-share';
        paragraphShareButtonElem.textContent = '一部を共有';
        paragraphShareButtonElem.addEventListener(
          'click',
          () => {
            htmlElem.classList.add('paragraph-share');
            allShareButtonElem.focus();

            mainNovelElem.addEventListener(
              'click',
              paragraphSelectListener,
              false,
            );

            addDataAttr(mainNovelElem);
            const currentParagraphElem = findElem(
              mainNovelElem.querySelectorAll(
                '[' + cssEscape(fragmentIdAttr) + ']',
              ),
              elem => {
                return isIntersection(elem, {
                  padding: {
                    bottom: footerElem.getBoundingClientRect().height,
                    top: headerElem.getBoundingClientRect().height,
                  },
                });
              },
            );
            const currentParagraphID = currentParagraphElem.getAttribute(
              fragmentIdAttr,
            );

            replaceFragmentIdSelector(currentParagraphID);
          },
          false,
        );

        const allShareButtonElem = document.createElement('button');
        allShareButtonElem.className = 'share-button all-share';
        allShareButtonElem.textContent = '全体を共有';
        allShareButtonElem.addEventListener(
          'click',
          () => {
            htmlElem.classList.remove('paragraph-share');
            paragraphShareButtonElem.focus();
            mainNovelElem.removeEventListener(
              'click',
              paragraphSelectListener,
              false,
            );
          },
          false,
        );

        return [paragraphShareButtonElem, allShareButtonElem];
      },
    );
    prependClass(paragraphShareAreaElem, 'paragraph-share-area');

    return [shareButtonElem, paragraphShareAreaElem];
  });
  prependClass(shareAreaElem, 'share-area');
  footerElem.insertBefore(shareAreaElem, footerElem.firstChild);
}
