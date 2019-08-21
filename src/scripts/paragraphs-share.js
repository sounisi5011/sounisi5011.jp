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

  function share({ title = document.title, text, url }) {
    if (typeof navigator.share === 'function') {
      navigator.share({ text, title, url });
    } else {
      window.prompt('Share!', url);
    }
  }

  const headerElem = document.querySelector('header.page');
  const footerElem = document.querySelector('footer.page');

  const shareButtonElem = document.createElement('button');
  shareButtonElem.classList.add('share-button');
  shareButtonElem.textContent = '現在の段落を共有';
  shareButtonElem.addEventListener(
    'click',
    () => {
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

      const url = location.href.replace(
        /(?:#.*)?$/,
        currentParagraphIDElem
          ? `#${encodeURIComponent(currentParagraphIDElem.id)}`
          : '',
      );
      share({
        url,
      });
    },
    false,
  );

  footerElem.insertBefore(shareButtonElem, footerElem.firstChild);
}
