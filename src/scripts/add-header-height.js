const CSS = window.CSS || {};
const rootElem = document.documentElement;
const rootStyle = rootElem.style;
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

      let timerID;
      const removeClass = () => {
        potentialIndicatedElement.classList.remove('pseudo-class::target');
        window.removeEventListener('hashchange', removeClass, false);
        potentialIndicatedElement.removeEventListener(
          'animationend',
          removeClass,
          false,
        );
        potentialIndicatedElement.removeEventListener(
          'animationcancel',
          removeClass,
          false,
        );
        window.clearTimeout(timerID);
      };
      window.addEventListener('hashchange', removeClass, false);
      potentialIndicatedElement.addEventListener(
        'animationend',
        removeClass,
        false,
      );
      potentialIndicatedElement.addEventListener(
        'animationcancel',
        removeClass,
        false,
      );
      potentialIndicatedElement.classList.add('pseudo-class::target');
      timerID = window.setTimeout(removeClass, 2000);

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
 * ページのルート要素にdata-canonical-url属性とdata-jump-id属性が存在する場合は、URLをリライトする
 */
const canonicalURL = rootElem.getAttribute('data-canonical-url');
const fragmentID = rootElem.getAttribute('data-jump-id');
if (canonicalURL && fragmentID) {
  const newURL = canonicalURL + '#' + encodeURIComponent(fragmentID);
  if (history && isFunc(history.replaceState)) {
    history.replaceState(null, '', newURL);
    const linkElem = document.querySelector('link[rel=canonical]');
    const metaElem = document.querySelector('meta[property="og:url"]');
    if (linkElem) {
      linkElem.setAttribute('href', canonicalURL);
    }
    if (metaElem) {
      metaElem.setAttribute('content', canonicalURL);
    }
    rootElem.removeAttribute('data-canonical-url');
    rootElem.removeAttribute('data-jump-id');
    scrollToFragment(fragmentID);
  } else if (isFunc(location.replace)) {
    location.replace(newURL);
  } else {
    location.href = newURL;
  }
}
