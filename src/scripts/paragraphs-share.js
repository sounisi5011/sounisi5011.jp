{
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

  /**
   * @param {Node|null} node
   * @returns {Node|null}
   */
  function getPrevIDElem(node) {
    while (node && !node.id) {
      if (node.previousSibling) {
        node = node.previousSibling;
        while (node.lastChild) {
          node = node.lastChild;
        }
      } else {
        node = node.parentNode;
      }
    }
    return node;
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
    for (let i = 0; i < childrenList.length; i++) {
      innerElem.appendChild(childrenList[i]);
    }

    return outerElem;
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
  const footerElem = document.querySelector('footer.page');

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
          document.querySelectorAll('main.novel-body>*'),
          elem => {
            // see https://blog.jxck.io/entries/2016-06-25/intersection-observer.html#表示判定
            return isIntersection(elem, {
              padding: {
                bottom: footerElem.getBoundingClientRect().height,
                top: headerElem.getBoundingClientRect().height,
              },
            });
          },
        );
        const currentParagraphIDElem = getPrevIDElem(currentParagraphElem);

        const fragment = currentParagraphIDElem
          ? '#' + encodeURIComponent(currentParagraphIDElem.id)
          : '';
        const url = canonicalURL + fragment;
        share({
          text: currentParagraphIDElem.getAttribute('data-share-text'),
          url,
        });
      },
      false,
    );

    const paragraphShareAreaElem = createBottomFixedBoxElem(
      paragraphShareInnerAreaElem => {
        const paragraphShareButtonElem = document.createElement('button');
        paragraphShareButtonElem.className = 'share-button paragraph-share';
        paragraphShareButtonElem.textContent = '一部を共有';
        paragraphShareButtonElem.addEventListener(
          'click',
          () => {
            htmlElem.classList.add('paragraph-share');
            allShareButtonElem.focus();
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
