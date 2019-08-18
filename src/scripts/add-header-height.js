(function(window, document, CSS) {
  if (typeof CSS.supports !== 'function') {
    return;
  }

  var rootStyle = document.documentElement.style;
  if (typeof rootStyle.setProperty !== 'function') {
    return;
  }

  if (
    CSS.supports('position', 'sticky') ||
    CSS.supports('position', '-webkit-sticky')
  ) {
    var headerElem = document.querySelector('header.page');
    var headerHeight = headerElem.getBoundingClientRect().height;

    rootStyle.setProperty('--header-height', `${headerHeight}px`);
  }
})(window, document, window.CSS || {});
