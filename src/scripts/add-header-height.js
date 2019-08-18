(window => {
  const { document } = window;
  const CSS = window.CSS || {};
  const rootStyle = document.documentElement.style;
  const isFunc = value => typeof value === 'function';

  if (!isFunc(CSS.supports)) {
    return;
  }

  if (!isFunc(rootStyle.setProperty)) {
    return;
  }

  if (
    !(
      CSS.supports('position', 'sticky') ||
      CSS.supports('position', '-webkit-sticky')
    )
  ) {
    return;
  }

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
})(window);
