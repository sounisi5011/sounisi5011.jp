{
  const fragmentIdAttr = 'data-fragment-id';
  /** @see https://drafts.csswg.org/css-syntax-3/#string-token-diagram */
  const fragmentIdAttrSelectorRegExp = /\[data-fragment-id=(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/gm;

  function sign(number) {
    return number < 0 ? -1 : +1;
  }

  function last(list) {
    return list[list.length - 1];
  }

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

  function getWindowHeight(doc = document) {
    return doc.documentElement.clientHeight;
  }

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

  function getViewOutSize(
    elem,
    { padding: { top = 0, bottom = 0 } = {} } = {},
  ) {
    const clientHeight = getWindowHeight(elem.ownerDocument || document);
    const rect = elem.getBoundingClientRect();
    const winTop = top;
    const winBottom = clientHeight - bottom;

    return {
      bottom: rect.bottom - winBottom,
      top: winTop - rect.top,
    };
  }

  function isIntersection(
    elem,
    { padding: { top = 0, bottom = 0 }, full = false } = {},
  ) {
    const clientHeight = getWindowHeight(elem.ownerDocument || document);
    const rect = elem.getBoundingClientRect();
    const winTop = top;
    const winBottom = clientHeight - bottom;

    if (full) {
      return winTop <= rect.top && rect.bottom <= winBottom;
    }

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

  function showUIElem(elem, show = true) {
    elem.tabIndex = show ? 0 : -1;
    elem.setAttribute('aria-hidden', !show);
  }

  function createElem(tagName, childrenCallback) {
    const elem = document.createElement(tagName);

    const childrenList = childrenCallback(elem) || [];
    each(childrenList, childNode => {
      elem.appendChild(childNode);
    });

    return elem;
  }

  function createBottomFixedBoxElem(...childrenCallbackList) {
    const outerElem = document.createElement('div');

    each(childrenCallbackList, childrenCallback => {
      const innerElem = document.createElement('div');
      outerElem.appendChild(innerElem);

      const childrenList = childrenCallback(innerElem, outerElem);
      each(childrenList, childNode => {
        innerElem.appendChild(childNode);
      });
    });

    outerElem.classList.add('bottom-fixed-box');

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
  let selectedParagraphID = '';
  const rootClassList = document.documentElement.classList;
  const headerElem = document.querySelector('header.page');
  const mainNovelElem = document.querySelector('.novel-body');
  const footerElem = document.querySelector('footer.page');
  const getWindowPaddingSize = () => {
    const headerRect = headerElem.getBoundingClientRect();
    const footerRect = footerElem.getBoundingClientRect();

    return {
      bottom: Math.max(0, getWindowHeight(document) - footerRect.top),
      top: Math.max(0, headerRect.bottom),
    };
  };
  const buildShareURL = () => {
    const fragment = selectedParagraphID
      ? '#' + encodeURIComponent(selectedParagraphID)
      : '';
    const url = canonicalURL + fragment;
    return url;
  };

  addDataAttr(mainNovelElem);

  const shareAreaElem = createBottomFixedBoxElem(
    (leftMenuElem, shareAreaElem) => {
      shareAreaElem.classList.add('share-area');
      leftMenuElem.classList.add('left-menu');

      return [
        createElem('button', twitterShareButtonElem => {
          twitterShareButtonElem.className = 'share-button twitter-share';
          twitterShareButtonElem.textContent = 'ツイート';
          twitterShareButtonElem.addEventListener(
            'click',
            () => {
              const url = buildShareURL();
              let text = document.title;
              if (selectedParagraphID) {
                text = document
                  .getElementById(selectedParagraphID)
                  .getAttribute('data-share-text');
              }

              /**
               * @see https://developer.twitter.com/en/docs/twitter-for-websites/tweet-button/guides/web-intent.html
               */
              let shareURLQuery = '';
              each(
                [
                  'url=' + encodeURIComponent(url),
                  'text=' + encodeURIComponent(text),
                ],
                param => {
                  if (param) {
                    if (shareURLQuery) {
                      shareURLQuery += '&';
                    }
                    shareURLQuery += param;
                  }
                },
              );
              const shareURL =
                'https://twitter.com/intent/tweet?' + shareURLQuery;

              window.open(shareURL, '_blank');
            },
            false,
          );
        }),
        createElem('button', lineShareButtonElem => {
          lineShareButtonElem.className = 'share-button line-share';
          lineShareButtonElem.textContent = 'LINEで送る';
          lineShareButtonElem.addEventListener(
            'click',
            () => {
              const url = buildShareURL();

              let shareURL;

              /**
               * @see https://kojole.hatenablog.com/entry/2018/09/19/113840
               */
              if (selectedParagraphID) {
                const text = document
                  .getElementById(selectedParagraphID)
                  .getAttribute('data-share-text');

                /**
                 * @see https://developers.line.biz/ja/docs/messaging-api/using-line-url-scheme/#sending-text-messages
                 */
                shareURL =
                  'https://line.me/R/msg/text/?' +
                  encodeURIComponent(text + '\n' + url);
              } else {
                /**
                 * @see https://org-media.line.me/ja/how_to_install#lineitbutton
                 */
                shareURL =
                  'https://social-plugins.line.me/lineit/share?url=' +
                  encodeURIComponent(url);
              }

              window.open(shareURL, '_blank');
            },
            false,
          );
        }),
        createElem('button', otherShareButtonElem => {
          otherShareButtonElem.className = 'share-button other-share';
          otherShareButtonElem.textContent = 'その他';
          otherShareButtonElem.addEventListener(
            'click',
            () => {
              const url = buildShareURL();
              if (selectedParagraphID) {
                const text = document
                  .getElementById(selectedParagraphID)
                  .getAttribute('data-share-text');

                share({
                  text,
                  url,
                });
              } else {
                share({
                  url,
                });
              }
            },
            false,
          );
        }),
      ];
    },
    rightMenuElem => {
      rightMenuElem.classList.add('right-menu');

      return [
        createBottomFixedBoxElem(
          (paragraphShareInnerAreaElem, paragraphShareAreaElem) => {
            paragraphShareAreaElem.classList.add('paragraph-share-area');

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
              if (
                rootClassList.contains('share-open') &&
                rootClassList.contains('paragraph-share')
              ) {
                const targetParagraphElem = findParentNode(
                  event.target,
                  node =>
                    typeof node.hasAttribute === 'function' &&
                    node.hasAttribute(fragmentIdAttr),
                  true,
                );
                if (targetParagraphElem) {
                  const fragmentID = targetParagraphElem.getAttribute(
                    fragmentIdAttr,
                  );
                  const paragraphElem = document.getElementById(fragmentID);
                  const paragraphLastElem = last(
                    mainNovelElem.querySelectorAll(
                      '[' +
                        cssEscape(fragmentIdAttr) +
                        '="' +
                        cssEscape(fragmentID) +
                        '"]',
                    ),
                  );

                  replaceFragmentIdSelector(fragmentID);

                  const padding = getWindowPaddingSize();
                  const topViewOut = getViewOutSize(paragraphElem, { padding })
                    .top;
                  const bottomViewOut = getViewOutSize(paragraphLastElem, {
                    padding,
                  }).bottom;
                  if (sign(topViewOut) !== sign(bottomViewOut)) {
                    if (Math.abs(bottomViewOut) < Math.abs(topViewOut)) {
                      window.scrollBy(0, bottomViewOut);
                    } else {
                      window.scrollBy(0, -topViewOut);
                    }
                  }

                  selectedParagraphID = fragmentID;
                }
              }
            };

            const paragraphShareButtonElem = createElem(
              'button',
              paragraphShareButtonElem => {
                paragraphShareButtonElem.className =
                  'share-button paragraph-share';
                paragraphShareButtonElem.textContent = '一部を共有';
                paragraphShareButtonElem.addEventListener(
                  'click',
                  () => {
                    rootClassList.add('paragraph-share');

                    showUIElem(paragraphShareButtonElem, false);
                    showUIElem(allShareButtonElem);
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
                          padding: getWindowPaddingSize(),
                        });
                      },
                    );
                    const currentParagraphID = currentParagraphElem.getAttribute(
                      fragmentIdAttr,
                    );

                    replaceFragmentIdSelector(currentParagraphID);

                    selectedParagraphID = currentParagraphID;
                  },
                  false,
                );
              },
            );

            const allShareButtonElem = createElem(
              'button',
              allShareButtonElem => {
                allShareButtonElem.className = 'share-button all-share';
                allShareButtonElem.textContent = '全体を共有';
                showUIElem(allShareButtonElem, false);
                allShareButtonElem.addEventListener(
                  'click',
                  () => {
                    rootClassList.remove('paragraph-share');

                    showUIElem(allShareButtonElem, false);
                    showUIElem(paragraphShareButtonElem);
                    paragraphShareButtonElem.focus();

                    mainNovelElem.removeEventListener(
                      'click',
                      paragraphSelectListener,
                      false,
                    );

                    selectedParagraphID = '';
                  },
                  false,
                );
              },
            );

            return [paragraphShareButtonElem, allShareButtonElem];
          },
        ),
        createElem('button', shareButtonElem => {
          shareButtonElem.className = 'share-button toggle-menu';
          shareButtonElem.textContent = '共有';
          shareButtonElem.addEventListener(
            'click',
            () => {
              if (rootClassList.contains('share-open')) {
                rootClassList.remove('share-open');
                shareButtonElem.textContent = '共有';
              } else {
                rootClassList.add('share-open');
                shareButtonElem.textContent = '閉じる';
              }
            },
            false,
          );
        }),
      ];
    },
  );
  footerElem.insertBefore(shareAreaElem, footerElem.firstChild);
}
