(window => {
  const { document, location, URIError, encodeURIComponent } = window;
  const CSS = window.CSS || {};
  const fragmentIdAttr = 'data-fragment-id';

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

  const cssSupports =
    typeof CSS.supports === 'function'
      ? CSS.supports
      : typeof window.supportsCSS === 'function'
      ? window.supportsCSS
      : () => null;
  const cssEscape =
    typeof CSS.escape === 'function'
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

  /**
   * @see https://qiita.com/rana_kualu/items/95a7adf8420ea2b9f657
   * @see https://www.filamentgroup.com/lab/load-css-simpler/
   */
  function importStyle(src, callback) {
    const linkElem = document.createElement('link');
    linkElem.rel = 'stylesheet';
    // linkElem.type = 'text/css';
    linkElem.media = 'print';
    if (callback) {
      linkElem.onload = () => {
        linkElem.media = 'all';
        callback();
      };
    }
    linkElem.onerror = error => {
      throw new URIError(
        "Cannot import style '" +
          ((error && error.target && error.target.src) || src) +
          "'",
      );
    };
    linkElem.href = src;
    document.head.appendChild(linkElem);
  }

  function importScript(src, callback) {
    const scriptElem = document.createElement('script');
    // scriptElem.type = 'text/javascript';
    if (callback) {
      scriptElem.onload = callback;
    }
    scriptElem.onerror = error => {
      throw new URIError(
        "Cannot import script '" +
          ((error && error.target && error.target.src) || src) +
          "'",
      );
    };
    scriptElem.src = src;
    document.body.appendChild(scriptElem);
  }

  function importAssets(srcList, callback) {
    let len = srcList.length;
    const fn = () => {
      if (--len === 0) {
        callback();
      }
    };

    each(srcList, src => {
      if (/\.css$/.test(src)) {
        importStyle(src, fn);
      } else if (/\.js$/.test(src)) {
        importScript(src, fn);
      } else {
        len--;
      }
    });
  }

  function getElemWidth(elem) {
    if (!(elem && typeof elem.getBoundingClientRect === 'function')) {
      return 0;
    }

    return reduce(
      elem.children,
      (width, elem) => Math.max(width, getElemWidth(elem)),
      elem.getBoundingClientRect().width,
    );
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

    const childrenList =
      (typeof childrenCallback === 'function'
        ? childrenCallback(elem)
        : childrenCallback) || [];

    each(childrenList, childNode => {
      elem.appendChild(
        typeof childNode === 'string'
          ? document.createTextNode(childNode)
          : childNode,
      );
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

    if (rootNode.hasAttribute('data-share-ignore')) {
      return {};
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

  function main(dialogElem) {
    const rootElem = document.documentElement;
    const canonicalURL =
      rootElem.getAttribute('data-canonical-url') ||
      getCanonicalURL() ||
      location.href.replace(/#.*$/, '');
    let selectedParagraphID = '';
    const rootClassList = rootElem.classList;
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
    let share = data => navigator.share(data);

    addDataAttr(mainNovelElem);

    let leftMenuElem;
    const shareAreaElem = createBottomFixedBoxElem(
      (elem, shareAreaElem) => {
        leftMenuElem = elem;
        shareAreaElem.classList.add('share-area');
        leftMenuElem.classList.add('left-menu');

        return [
          createElem('button', twitterShareButtonElem => {
            twitterShareButtonElem.className = 'share-button twitter-share';
            twitterShareButtonElem.textContent = 'ツイート';
            twitterShareButtonElem.addEventListener(
              'click',
              () => {
                let url = canonicalURL;
                let text = document.title.replace(
                  /(^|[\s])sounisi5011\.jp(?=[\s]|$)/gm,
                  '$1sounisi5011\u{200B}.jp',
                );
                if (selectedParagraphID) {
                  const selectedParagraphElem = document.getElementById(
                    selectedParagraphID,
                  );
                  url = selectedParagraphElem.getAttribute('data-share-url');
                  text = selectedParagraphElem.getAttribute('data-share-text');
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
                let shareURL;

                /**
                 * @see https://kojole.hatenablog.com/entry/2018/09/19/113840
                 */
                if (selectedParagraphID) {
                  const selectedParagraphElem = document.getElementById(
                    selectedParagraphID,
                  );
                  const url = selectedParagraphElem.getAttribute(
                    'data-share-url',
                  );
                  const text = selectedParagraphElem.getAttribute(
                    'data-share-text',
                  );

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
                    encodeURIComponent(canonicalURL);
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
                if (selectedParagraphID) {
                  const selectedParagraphElem = document.getElementById(
                    selectedParagraphID,
                  );
                  share({
                    text: selectedParagraphElem.getAttribute('data-share-text'),
                    url: selectedParagraphElem.getAttribute('data-share-url'),
                  });
                } else {
                  share({
                    url: canonicalURL,
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

              function setSelectClass(fragmentID) {
                const replaceSelector =
                  '[' +
                  cssEscape(fragmentIdAttr) +
                  '="' +
                  cssEscape(fragmentID) +
                  '"],' +
                  ('[' + cssEscape(fragmentIdAttr) + '].select');
                each(
                  mainNovelElem.querySelectorAll(replaceSelector),
                  paragraphElem => {
                    const classList = paragraphElem.classList;
                    if (
                      paragraphElem.getAttribute(fragmentIdAttr) === fragmentID
                    ) {
                      classList.add('select');
                    } else {
                      classList.remove('select');
                    }
                  },
                );
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

                    setSelectClass(fragmentID);

                    const padding = getWindowPaddingSize();
                    const topViewOut = getViewOutSize(paragraphElem, {
                      padding,
                    }).top;
                    const bottomViewOut = getViewOutSize(paragraphLastElem, {
                      padding,
                    }).bottom;
                    if (sign(topViewOut) !== sign(bottomViewOut)) {
                      if (Math.abs(bottomViewOut) < Math.abs(topViewOut)) {
                        // Note: 要素の下部に、固定フッタの高さを考慮したスタイルは指定していないため、
                        //       scrollIntoView()メソッドではなく、scrollBy()メソッドを使用する。
                        window.scrollBy(0, bottomViewOut);
                      } else {
                        // Note: 固定ヘッダのあるページで正しい位置にスクロールさせるハック等の影響が出るため、
                        //       scrollBy()メソッドではなく、scrollIntoView()メソッドを使用する。
                        //       ハックの例：https://css-tricks.com/hash-tag-links-padding/#article-header-id-1
                        paragraphElem.scrollIntoView();
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
                      const padding = getWindowPaddingSize();
                      padding.top += 16 * 1.5;
                      const currentParagraphElem = findElem(
                        mainNovelElem.querySelectorAll(
                          '[' + cssEscape(fragmentIdAttr) + ']',
                        ),
                        elem => isIntersection(elem, { padding }),
                      );
                      const currentParagraphID = currentParagraphElem.getAttribute(
                        fragmentIdAttr,
                      );

                      setSelectClass(currentParagraphID);

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
                  // Note: このスタイル指定は、.paragraph-shareと.all-shareが（displayプロパティなどで）完全に非表示にならない事を前提としている。
                  leftMenuElem.style.maxWidth =
                    'calc(100% - (' +
                    getElemWidth(rightMenuElem) +
                    'px + 1em))';
                }
              },
              false,
            );
          }),
        ];
      },
    );

    footerElem.insertBefore(shareAreaElem, footerElem.firstChild);

    if (dialogElem) {
      const createCopyButton = (inputElem, className = 'copy-area') => {
        if (typeof document.execCommand !== 'function') {
          return inputElem;
        }

        return createElem('div', copyContainerElem => {
          copyContainerElem.className = className;
          return [
            inputElem,
            createElem('button', copyButtonElem => {
              const copyButtonClassList = copyButtonElem.classList;
              const focusoutListener = () => {
                copyButtonClassList.remove('copy-success');
              };

              copyButtonElem.className = 'copy-button';
              copyButtonElem.addEventListener(
                'click',
                () => {
                  /**
                   * コピー操作でキーボードが表示されないようにする
                   * @see https://qiita.com/simiraaaa/items/2e7478d72f365aa48356#注意点
                   * @see https://github.com/sindresorhus/copy-text-to-clipboard/blob/v2.1.0/index.js#L8-L9
                   */
                  const readOnly = inputElem.readOnly;
                  inputElem.readOnly = true;

                  /**
                   * 選択で画面が拡大されないようにする
                   * @see https://mamewaza.com/support/blog/javascript-copy.html#id35462
                   * @see https://github.com/sindresorhus/copy-text-to-clipboard/blob/v2.1.0/index.js#L14
                   */
                  const fontSize = inputElem.style.fontSize;
                  inputElem.style.fontSize = '16px';

                  /**
                   * select()メソッドが正しく機能しないiOSのWebKitブラウザでも全選択させる
                   * @see https://mamewaza.com/support/blog/javascript-copy.html
                   * @see https://stackoverflow.com/a/6431441/4907315
                   * @see https://stackoverflow.com/a/13761214/4907315
                   * @see http://pointofviewpoint.air-nifty.com/blog/2011/03/safaritextarea-.html
                   * @see https://github.com/sindresorhus/copy-text-to-clipboard/blob/v2.1.0/index.js#L25-L27
                   */
                  inputElem.focus();
                  inputElem.select();
                  inputElem.selectionStart = 0;
                  inputElem.selectionEnd = inputElem.value.length;

                  try {
                    if (document.execCommand('copy')) {
                      copyButtonClassList.add('copy-success');
                    }
                  } catch (e) {
                    //
                  }

                  inputElem.readOnly = readOnly;
                  inputElem.style.fontSize = fontSize;
                  copyButtonElem.focus();
                },
                false,
              );
              copyButtonElem.addEventListener('blur', focusoutListener, false);
              copyButtonElem.addEventListener(
                'mouseout',
                focusoutListener,
                false,
              );
              copyButtonElem.appendChild(createElem('span', ['コピー']));
            }),
          ];
        });
      };

      dialogElem.className = 'share-dialog';
      dialogElem.addEventListener(
        'click',
        event => {
          if (event.target === dialogElem) {
            dialogElem.close();
          }
        },
        false,
      );

      const titleInputElem = createElem('input', elem => {
        elem.readOnly = true;
      });
      const urlInputElem = createElem('input', elem => {
        elem.readOnly = true;
      });
      const textInputElem = createElem('textarea', elem => {
        elem.readOnly = true;
      });

      dialogElem.appendChild(
        createElem('div', [
          createElem('label', ['タイトル', createCopyButton(titleInputElem)]),
          createElem('label', ['URL', createCopyButton(urlInputElem)]),
          createElem('label', labelElem => {
            labelElem.className = 'text-copy-area';
            return ['テキスト', createCopyButton(textInputElem)];
          }),
          createElem('button', closeButtonElem => {
            closeButtonElem.className = 'close-button';
            closeButtonElem.textContent = '閉じる';
            closeButtonElem.addEventListener(
              'click',
              () => {
                dialogElem.close();
              },
              false,
            );
          }),
        ]),
      );
      document.body.appendChild(dialogElem);

      const dialogClassList = dialogElem.classList;
      share = ({ title = document.title, text, url }) => {
        titleInputElem.value = title;
        urlInputElem.value = url;
        if (text) {
          dialogClassList.remove('hide-text');
          textInputElem.value = text;
        } else {
          dialogClassList.add('hide-text');
        }
        dialogElem.showModal();
        if (cssSupports('position', 'fixed') === false) {
          dialogElem.style.top =
            window.pageYOffset +
            getWindowHeight(dialogElem.ownerDocument || document) / 2 +
            'px';
        }
      };
    }
  }

  if (typeof navigator.share === 'function') {
    main();
  } else {
    const dialogElem = document.createElement('dialog');
    if (typeof dialogElem.showModal === 'function') {
      main(dialogElem);
    } else {
      importAssets(
        [
          '/dialog-polyfill/dialog-polyfill.css',
          '/dialog-polyfill/dialog-polyfill.js',
        ],
        () => {
          window.dialogPolyfill.registerDialog(dialogElem);
          main(dialogElem);
        },
      );
    }
  }
})(window);
