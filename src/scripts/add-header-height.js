(window => {
  const { document } = window;
  let requestAnimationFrame = window.requestAnimationFrame;
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

  if (!isFunc(requestAnimationFrame)) {
    requestAnimationFrame = callback => {
      window.setTimeout(callback, 0);
    };
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
      requestAnimationFrame(() => {
        updateProp();
        updating = false;
      });
    }
  };

  window.addEventListener('resize', resizeListener, false);
  updateProp();
})(window);
