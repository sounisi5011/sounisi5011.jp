((window, document, CSS) => {
  const requestAnimationFrame =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : callback => {
          setTimeout(callback, 0);
        };

  if (typeof CSS.supports !== 'function') {
    return;
  }

  const rootStyle = document.documentElement.style;
  if (typeof rootStyle.setProperty !== 'function') {
    return;
  }

  if (
    CSS.supports('position', 'sticky') ||
    CSS.supports('position', '-webkit-sticky')
  ) {
    const headerElem = document.querySelector('header.page');
    const updateProp = () => {
      const headerHeight = headerElem.getBoundingClientRect().height;
      rootStyle.setProperty('--header-height', `${headerHeight}px`);
    };

    let updating = false;
    const resizeListener = () => {
      if (!updating) {
        updating = true;
        requestAnimationFrame(() => {
          updateProp();
          updating = false;
        });
      }
    };

    window.addEventListener('resize', resizeListener, false);
    updateProp();
  }
})(window, document, window.CSS || {});
