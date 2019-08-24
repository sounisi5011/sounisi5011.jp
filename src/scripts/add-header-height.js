(window => {
  const { document, location, history } = window;
  const CSS = window.CSS || {};
  const rootStyle = document.documentElement.style;
  const isFunc = value => typeof value === 'function';

  /**
   * @see https://html.spec.whatwg.org/multipage/browsing-the-web.html#scroll-to-the-fragment-identifier
   */
  const scrollToFragment = fragment => {
    if (fragment !== '') {
      let potentialIndicatedElement = document.getElementById(fragment);

      if (!potentialIndicatedElement) {
        const decodedFragment = decodeURIComponent(fragment);
        potentialIndicatedElement = document.getElementById(decodedFragment);
        if (!potentialIndicatedElement) {
          if (!/^top$/i.test(decodedFragment)) {
            return;
          }
        }
      }

      if (potentialIndicatedElement) {
        potentialIndicatedElement.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  };

  if (isFunc(CSS.supports) && isFunc(rootStyle.setProperty)) {
    if (
      CSS.supports('position', 'sticky') ||
      CSS.supports('position', '-webkit-sticky')
    ) {
      const headerElem = document.querySelector('header.page');
      const updateProp = () => {
        const headerHeight = headerElem.getBoundingClientRect().height;
        rootStyle.setProperty('--header-height', headerHeight + 'px');
      };

      let updating = false;
      const resizeListener = () => {
        if (!updating) {
          updating = true;
          // Note: CSS.supports()とposition:stickyに対応しているブラウザは、
          //       全てrequestAnimationFrame()に対応している。
          //       polyfillは不要
          window.requestAnimationFrame(() => {
            updateProp();
            updating = false;
          });
        }
      };

      window.addEventListener('resize', resizeListener, false);
      updateProp();
    }
  }

  /*
   * ページのURLにクエリパラメータ fragment が存在する場合は、URLをリライトする
   */
  const origURL = location.href;
  let fragmentID = false;
  const queryRemovedURL = origURL.replace(
    /(^|[?&])fragment=([^&#]*)(&|(?=#)|$)/g,
    (_, beforeSep, id, afterSep) => {
      if (fragmentID === false) {
        fragmentID = id;
      }
      return afterSep ? beforeSep : '';
    },
  );
  if (origURL !== queryRemovedURL) {
    const newURL = queryRemovedURL.replace(/(?:#.*)?$/, '#' + fragmentID);

    if (history && isFunc(history.replaceState)) {
      history.replaceState(null, '', newURL);
      scrollToFragment(fragmentID);
    } else if (isFunc(location.replace)) {
      location.replace(newURL);
    } else {
      location.href = newURL;
    }
  }
})(window);
