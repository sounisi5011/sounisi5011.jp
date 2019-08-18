(function(window, document, CSS) {
  var requestAnimationFrame =
    window.requestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame;
  if (typeof requestAnimationFrame !== 'function') {
    requestAnimationFrame = function(callback) {
      window.setTimeout(callback, 1000 / 60);
    };
  }

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
    var updateProp = function() {
      var headerHeight = headerElem.getBoundingClientRect().height;
      rootStyle.setProperty('--header-height', `${headerHeight}px`);
    };

    var updating = false;
    var resizeListener = function() {
      if (!updating) {
        updating = true;
        requestAnimationFrame(function() {
          updateProp();
          updating = false;
        });
      }
    };

    window.addEventListener('resize', resizeListener, false);
    updateProp();
  }
})(window, document, window.CSS || {});
